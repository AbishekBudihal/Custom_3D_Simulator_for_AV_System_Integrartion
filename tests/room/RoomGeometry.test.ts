import { describe, it, expect } from 'vitest';
import { createDefaultRoom, type RoomModel } from '../../src/room/RoomModel';
import {
  WALL_KEYS,
  wallOffsetToWorld,
  worldToWallOffset,
  computeWallCandidates,
  determinePresentationWall,
  getPresentationWall,
  seatForward,
  presentationRotation,
  rotatePoint
} from '../../src/room/RoomGeometry';

function bareRoom(overrides: Partial<RoomModel> = {}): RoomModel {
  const r = createDefaultRoom('conference');
  return { ...r, openings: [], columns: [], ...overrides };
}

describe('RoomGeometry — wall offset conversions', () => {
  it('wallOffsetToWorld and worldToWallOffset round-trip for every wall', () => {
    const room = bareRoom({ width: 10, depth: 7 });
    WALL_KEYS.forEach((wall) => {
      for (const offset of [0, 1.5, 4.9, 9.9]) {
        const clamped = Math.min(offset, wall === 'front' || wall === 'back' ? room.width : room.depth);
        const { x, z } = wallOffsetToWorld(room, wall, clamped);
        const back = worldToWallOffset(room, wall, x, z);
        expect(back).toBeCloseTo(clamped, 9);
      }
    });
  });

  it('matches the exact opening placement convention RoomGenerator uses (offset from the wall origin)', () => {
    // The default room's door is on the front wall at offset 3.6, width 1.0
    // — its world center should land at x = -width/2 + 3.6 + 0.5.
    const room = createDefaultRoom('conference');
    const door = room.openings[0];
    const { x, z } = wallOffsetToWorld(room, 'front', door.offset + door.width / 2);
    expect(x).toBeCloseTo(-room.width / 2 + door.offset + door.width / 2, 9);
    expect(z).toBeCloseTo(-room.depth / 2, 9);
  });
});

describe('RoomGeometry — seatForward / presentationRotation consistency', () => {
  it('rotating the canonical forward vector by each wall\'s presentationRotation gives that wall\'s outward direction', () => {
    // front -> -Z, back -> +Z, left -> -X, right -> +X
    const expected: Record<string, { x: number; z: number }> = {
      front: { x: 0, z: -1 },
      back: { x: 0, z: 1 },
      left: { x: -1, z: 0 },
      right: { x: 1, z: 0 }
    };
    WALL_KEYS.forEach((wall) => {
      const rot = presentationRotation(wall);
      const f = seatForward(0);
      const rotated = rotatePoint(f.x, f.z, rot);
      expect(rotated.x).toBeCloseTo(expected[wall].x, 9);
      expect(rotated.z).toBeCloseTo(expected[wall].z, 9);
    });
  });
});

describe('RoomGeometry — computeWallCandidates', () => {
  it('excludes a door from the usable span, with clearance on both sides', () => {
    const room = bareRoom({
      width: 10,
      depth: 7,
      openings: [{ wall: 'front', offset: 3.6, width: 1.0, height: 2.1, sillHeight: 0, kind: 'door' }]
    });
    const [front] = computeWallCandidates(room, 0, 0).filter((c) => c.wall === 'front');
    // Widest clear span should be the far side of the door: [4.9, 10] -> 5.1m
    expect(front.usableWidthM).toBeCloseTo(5.1, 1);
    expect(front.hasDoor).toBe(true);
    expect(front.bestSpanStartM).toBeCloseTo(4.9, 1);
  });

  it('a wall with no openings is fully usable and scores higher than an obstructed one of the same length', () => {
    const room = bareRoom({
      width: 10,
      depth: 7,
      openings: [{ wall: 'front', offset: 3.6, width: 1.0, height: 2.1, sillHeight: 0, kind: 'door' }]
    });
    const candidates = computeWallCandidates(room, 0, 0);
    const front = candidates.find((c) => c.wall === 'front')!;
    const back = candidates.find((c) => c.wall === 'back')!;
    expect(back.usableWidthM).toBeCloseTo(10, 9);
    expect(back.score).toBeGreaterThan(front.score);
  });

  it('marks a candidate invalid when even its widest clear span is narrower than what is required', () => {
    const room = bareRoom({ width: 3, depth: 5 });
    const candidates = computeWallCandidates(room, 6, 0); // no wall in a 3x5 room is 6m wide
    candidates.forEach((c) => expect(c.valid).toBe(false));
  });
});

describe('RoomGeometry — presentation wall selection', () => {
  it('automatically avoids the wall with a door', () => {
    const room = createDefaultRoom('conference'); // door on 'front' by default
    const wall = determinePresentationWall(room);
    expect(wall).not.toBe('front');
  });

  it('an explicit room.presentationWall override always wins, even over a better-scoring wall', () => {
    const room = bareRoom({ width: 10, depth: 7, presentationWall: 'right' });
    expect(getPresentationWall(room)).toBe('right');
  });

  it('with no openings anywhere, front wins by convention (tie-break order)', () => {
    const room = bareRoom({ width: 10, depth: 7 });
    expect(determinePresentationWall(room)).toBe('front');
  });
});
