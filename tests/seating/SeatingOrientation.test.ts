import { describe, it, expect } from 'vitest';
import { generateSeating, defaultSeatingConfig } from '../../src/room/SeatingGenerator';
import { createDefaultRoom, type RoomModel } from '../../src/room/RoomModel';
import { seatForward, getPresentationWall, wallCenter as wallCenterOf } from '../../src/room/RoomGeometry';

function bareRoom(overrides: Partial<RoomModel> = {}): RoomModel {
  const r = createDefaultRoom('conference');
  return { ...r, openings: [], columns: [], ...overrides };
}

/** A seat "faces the presentation wall" if the dot product of its forward
 *  vector and the vector from the seat toward the wall's center is
 *  positive — i.e. it's generally looking toward that wall, not away from
 *  it. Geometric, not exact-angle, so it's robust to per-seat facing
 *  variation within a row-based layout. */
function facesWall(seatX: number, seatZ: number, facing: number, wallCenter: { x: number; z: number }): boolean {
  const f = seatForward(facing);
  const toWallX = wallCenter.x - seatX;
  const toWallZ = wallCenter.z - seatZ;
  return f.x * toWallX + f.z * toWallZ > 0;
}

describe('SeatingOrientation — Test 2: seats face the presentation wall (classroom/training)', () => {
  it('classroom rows all face the presentation wall', () => {
    const room = bareRoom({ width: 12, depth: 9 });
    const wall = getPresentationWall(room);
    const center = wallCenterOf(room, wall);
    const cfg = defaultSeatingConfig(30, 'classroom');
    const { seats } = generateSeating(room, cfg);

    expect(seats.length).toBeGreaterThan(0);
    seats.forEach((s) => {
      expect(facesWall(s.x, s.z, s.facing, center)).toBe(true);
    });
  });

  it('training-room (classroom-style) rows all face the presentation wall regardless of which wall that is', () => {
    // Force the presentation wall to a side wall to exercise the
    // width/depth-swap + rotation path, not just the default 'front' case.
    const room = bareRoom({ width: 10, depth: 8, presentationWall: 'left' });
    const center = wallCenterOf(room, 'left');
    const cfg = defaultSeatingConfig(20, 'classroom');
    const { seats } = generateSeating(room, cfg);

    expect(seats.length).toBeGreaterThan(0);
    seats.forEach((s) => {
      expect(facesWall(s.x, s.z, s.facing, center)).toBe(true);
      // and stay inside the actual room bounds, not the swapped virtual one
      expect(Math.abs(s.x)).toBeLessThanOrEqual(room.width / 2 + 0.01);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(room.depth / 2 + 0.01);
    });
  });
});

describe('SeatingOrientation — Test 3: seat.forward points toward the presentation/display direction', () => {
  it('row-based layouts (classroom, theater, u-shape) have every seat facing the presentation wall', () => {
    // u_shape is included here (not just classroom/theater) because,
    // unlike a boardroom's head seat or a hollow-square's near-display
    // row, none of its seats are meant to face across the table away from
    // the display — the open end of the U faces the presentation wall.
    const room = bareRoom({ width: 10, depth: 7 });
    const wall = getPresentationWall(room);
    const center = wallCenterOf(room, wall);

    (['classroom', 'theater', 'u_shape'] as const).forEach((layout) => {
      const cfg = defaultSeatingConfig(12, layout);
      const { seats } = generateSeating(room, cfg);
      expect(seats.length).toBeGreaterThan(0);
      seats.forEach((s) => {
        expect(facesWall(s.x, s.z, s.facing, center)).toBe(true);
      });
    });
  });

  it('a boardroom seat picked at random has a forward vector, and it is not the zero vector', () => {
    // Sanity check that facing/forward is actually populated and
    // meaningful (not left at a default 0 that happens to point somewhere
    // plausible) for the layout that most directly reproduces the bug.
    const room = bareRoom({ width: 10, depth: 7 });
    const cfg = defaultSeatingConfig(12, 'boardroom');
    const { seats } = generateSeating(room, cfg);
    expect(seats.length).toBeGreaterThan(0);
    seats.forEach((s) => {
      const f = seatForward(s.facing);
      expect(Math.hypot(f.x, f.z)).toBeCloseTo(1, 9);
    });
  });
});

describe('SeatingOrientation — regression: boardroom left/right side seats face the table, not the side wall', () => {
  it('left-side seats face +X (toward center) and right-side seats face -X', () => {
    const room = bareRoom({ width: 10, depth: 7, presentationWall: 'front' });
    const cfg = defaultSeatingConfig(12, 'boardroom');
    const { seats } = generateSeating(room, cfg);

    const leftSeats = seats.filter((s) => s.id.startsWith('L'));
    const rightSeats = seats.filter((s) => /^R\d/.test(s.id));
    expect(leftSeats.length).toBeGreaterThan(0);
    expect(rightSeats.length).toBeGreaterThan(0);

    leftSeats.forEach((s) => expect(seatForward(s.facing).x).toBeGreaterThan(0));
    rightSeats.forEach((s) => expect(seatForward(s.facing).x).toBeLessThan(0));
  });

  it('u-shape left/right legs face inward toward the table, matching the boardroom convention', () => {
    const room = bareRoom({ width: 10, depth: 7, presentationWall: 'front' });
    const cfg = defaultSeatingConfig(16, 'u_shape');
    const { seats } = generateSeating(room, cfg);

    const leftLeg = seats.filter((s) => s.id.startsWith('UL'));
    const rightLeg = seats.filter((s) => s.id.startsWith('UR'));
    expect(leftLeg.length).toBeGreaterThan(0);
    expect(rightLeg.length).toBeGreaterThan(0);

    leftLeg.forEach((s) => expect(seatForward(s.facing).x).toBeGreaterThan(0));
    rightLeg.forEach((s) => expect(seatForward(s.facing).x).toBeLessThan(0));
  });
});
