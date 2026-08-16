import { describe, it, expect } from 'vitest';
import { generateSeating, defaultSeatingConfig } from '../../src/room/SeatingGenerator';
import { createDefaultRoom, type RoomModel } from '../../src/room/RoomModel';

function bareRoom(overrides: Partial<RoomModel> = {}): RoomModel {
  const r = createDefaultRoom('conference');
  return { ...r, openings: [], columns: [], ...overrides };
}

describe('Table furniture — boardroom produces one real table, not two wall-hugging strips', () => {
  it('generates exactly one table, centered, clear of every wall', () => {
    const room = bareRoom({ width: 10, depth: 7 });
    const cfg = defaultSeatingConfig(12, 'boardroom');
    const { seats, tables } = generateSeating(room, cfg);

    expect(tables.length).toBe(1);
    const t = tables[0];
    const hw = room.width / 2;
    const hd = room.depth / 2;
    const wallMargin = 0.6;

    expect(t.centerX - t.sizeX / 2).toBeGreaterThan(-hw + wallMargin);
    expect(t.centerX + t.sizeX / 2).toBeLessThan(hw - wallMargin);
    expect(t.centerZ - t.sizeZ / 2).toBeGreaterThan(-hd + wallMargin);
    expect(t.centerZ + t.sizeZ / 2).toBeLessThan(hd - wallMargin);
    expect(Math.abs(t.centerX)).toBeLessThan(0.5);

    // Every chair sits outside the table's footprint (not embedded in it).
    seats.forEach((s) => {
      const outsideX = Math.abs(s.x - t.centerX) > t.sizeX / 2 - 0.05;
      const outsideZ = Math.abs(s.z - t.centerZ) > t.sizeZ / 2 - 0.05;
      expect(outsideX || outsideZ).toBe(true);
    });
  });

  it('the whole table+chairs assembly clears every wall — not attached to any of them', () => {
    const room = bareRoom({ width: 10, depth: 7 });
    const cfg = defaultSeatingConfig(12, 'boardroom');
    const { seats, tables } = generateSeating(room, cfg);
    const t = tables[0];
    const hw = room.width / 2;
    const hd = room.depth / 2;

    const xs = [...seats.map((s) => s.x), t.centerX - t.sizeX / 2, t.centerX + t.sizeX / 2];
    const zs = [...seats.map((s) => s.z), t.centerZ - t.sizeZ / 2, t.centerZ + t.sizeZ / 2];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);

    const clearance = 0.3;
    expect(minX).toBeGreaterThan(-hw + clearance);
    expect(maxX).toBeLessThan(hw - clearance);
    expect(minZ).toBeGreaterThan(-hd + clearance);
    expect(maxZ).toBeLessThan(hd - clearance);
  });

  it('stays a single centered table even when the presentation wall is a side wall', () => {
    const room = bareRoom({ width: 10, depth: 8, presentationWall: 'left' });
    const cfg = defaultSeatingConfig(12, 'boardroom');
    const { tables } = generateSeating(room, cfg);
    expect(tables.length).toBe(1);
    const t = tables[0];
    expect(Math.abs(t.centerX) + t.sizeX / 2).toBeLessThanOrEqual(room.width / 2 + 0.01);
    expect(Math.abs(t.centerZ) + t.sizeZ / 2).toBeLessThanOrEqual(room.depth / 2 + 0.01);
  });
});

describe('Table furniture — per-layout table counts match the furniture model, not seat count', () => {
  it('classroom produces independent desks (one table per 1–2 seats), not a wall-width row slab', () => {
    const room = bareRoom({ width: 12, depth: 9 });
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(20, 'classroom'));
    expect(tables.length).toBeGreaterThan(1);
    expect(tables.length).toBe(new Set(seats.map((s) => s.tableId)).size);
    tables.forEach((t) => expect(t.sizeX).toBeLessThanOrEqual(1.6));
    seats.forEach((s) => {
      expect(s.tableId).toBeTruthy();
      expect(tables.some((t) => t.id === s.tableId)).toBe(true);
    });
  });

  it('theater has no tables at all', () => {
    const room = bareRoom({ width: 12, depth: 9 });
    const { tables } = generateSeating(room, defaultSeatingConfig(20, 'theater'));
    expect(tables.length).toBe(0);
  });

  it('u-shape produces exactly 3 table segments (left leg, right leg, back)', () => {
    const room = bareRoom({ width: 10, depth: 7 });
    const { tables } = generateSeating(room, defaultSeatingConfig(16, 'u_shape'));
    expect(tables.length).toBe(3);
  });

  it('hollow-square adds a 4th (front) segment on top of the U-shape', () => {
    const room = bareRoom({ width: 10, depth: 7 });
    // Capacity has to exceed what the U alone can seat in this room (24 here)
    // so the 4th, front-wall-facing segment actually gets used.
    const { tables } = generateSeating(room, defaultSeatingConfig(26, 'hollow_square'));
    expect(tables.length).toBe(4);
  });
});
