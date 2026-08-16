import { describe, it, expect } from 'vitest';
import { alignmentGuides, distanceM, nearestCadSnap, roomCadTargets, snapToGrid } from '../../src/interaction/CadSnap';
import { rotateTableSpec90, seatsAroundConferenceTable } from '../../src/room/FurnitureRelayout';
import { AppState } from '../../src/app/AppState';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { defaultSeatingConfig, generateSeating } from '../../src/room/SeatingGenerator';

describe('CadSnap', () => {
  it('snaps to grid and reports distance', () => {
    expect(snapToGrid(1.24, 2.26, 0.5)).toEqual({ x: 1, z: 2.5 });
    expect(distanceM({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
  });

  it('prefers object-center over grid when close', () => {
    const hit = nearestCadSnap(0.04, 0.03, [{ x: 0, z: 0, kind: 'object-center' }], 0.5, 0.12);
    expect(hit.kind).toBe('object-center');
    expect(hit.x).toBe(0);
  });

  it('emits alignment guides without creating objects', () => {
    const g = alignmentGuides({ x: 1, z: 2 }, [{ x: 1.02, z: 4 }]);
    expect(g.some((x) => x.axis === 'x')).toBe(true);
  });

  it('includes room center and walls', () => {
    const t = roomCadTargets({ width: 8, depth: 10 });
    expect(t.some((p) => p.kind === 'center' && p.x === 0 && p.z === 0)).toBe(true);
    expect(t.some((p) => p.kind === 'wall')).toBe(true);
  });
});

describe('FurnitureRelayout', () => {
  it('places 8 chairs around TableSpec edges, not the room width', () => {
    const table = { id: 'conference-table', centerX: 0, centerZ: 0, sizeX: 1.2, sizeZ: 2.8, furnitureId: 'generic-conference' };
    const seats = seatsAroundConferenceTable(table, 8);
    expect(seats).toHaveLength(8);
    expect(Math.max(...seats.map((s) => Math.abs(s.x)))).toBeLessThan(2);
    const rotated = rotateTableSpec90(table);
    expect(rotated.sizeX).toBe(2.8);
    expect(rotated.sizeZ).toBe(1.2);
  });
});

describe('Phase 2A workspace — TableSpec ownership', () => {
  it('does not regenerate seating when room size changes', () => {
    const state = new AppState();
    const room = { ...createDefaultRoom('conference'), width: 8, depth: 10 };
    state.setRoom(room);
    const gen = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    state.setSeats(gen.seats, gen.tables);
    const table = state.tables[0];
    const seatsBefore = JSON.stringify(state.seats);
    const tablesBefore = JSON.stringify(state.tables);
    expect(table.sizeX).toBeLessThan(room.width * 0.6);
    expect(table.sizeZ).toBeLessThan(room.depth * 0.6);
    state.setRoom({ ...state.room!, width: 9, depth: 11 });
    expect(JSON.stringify(state.seats)).toBe(seatsBefore);
    expect(JSON.stringify(state.tables)).toBe(tablesBefore);
    expect(state.tables[0].id).toBe(table.id);
    expect(state.tables[0].sizeX).toBe(table.sizeX);
  });

  it('resizing a table relayouts chairs from TableSpec and undo restores both', () => {
    const state = new AppState();
    const room = { ...createDefaultRoom('conference'), width: 8, depth: 10 };
    state.setRoom(room);
    const gen = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    state.setSeats(gen.seats, gen.tables);
    const tableId = state.tables[0].id;
    const beforeZ = state.tables[0].sizeZ;
    state.updateTable(tableId, { sizeZ: beforeZ + 0.4 });
    expect(state.seats).toHaveLength(8);
    expect(state.tables[0].id).toBe(tableId);
    expect(state.tables[0].sizeZ).toBeCloseTo(beforeZ + 0.4);
    state.undo();
    expect(state.tables[0].sizeZ).toBeCloseTo(beforeZ);
    expect(state.tables[0].id).toBe(tableId);
  });

  it('measure points are view state and not in undo snapshots', () => {
    const state = new AppState();
    state.addMeasurePoint(0, 0);
    state.addMeasurePoint(1, 0);
    expect(state.measureDistanceM).toBe(1);
    const snap = state.captureSnapshot();
    expect('measurePoints' in snap).toBe(false);
  });

  it('2/6/8/12/16 pax conference tables stay occupancy-driven', () => {
    const room = { ...createDefaultRoom('conference'), width: 8, depth: 10 };
    for (const n of [2, 6, 8, 12, 16]) {
      const gen = generateSeating(room, defaultSeatingConfig(n, 'boardroom'));
      if (!gen.valid) continue;
      expect(Math.max(gen.tables[0].sizeX, gen.tables[0].sizeZ)).toBeLessThan(room.width * 0.7);
      expect(Math.min(gen.tables[0].sizeX, gen.tables[0].sizeZ)).toBeLessThan(2.2);
    }
  });
});
