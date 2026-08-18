import { describe, it, expect } from 'vitest';
import { AppState } from '../../src/app/AppState';
import { createDefaultRoom, type RoomModel } from '../../src/room/RoomModel';
import { defaultSeatingConfig, generateSeating } from '../../src/room/SeatingGenerator';
import {
  applyPresetToTable,
  clampTableSpecSizes,
  matchTablePreset,
  practicalSeatCapacity,
  relayoutSeatsForTable,
  tablePreset
} from '../../src/room/ParametricTable';
import { tableAabb, chairAabb, aabbsOverlap } from '../../src/room/FurnitureGeometry';
import { runDesignValidation } from '../../src/av/validation/DesignValidationEngine';
import { EquipmentCatalog } from '../../src/catalog/EquipmentCatalog';

function bareRoom(overrides: Partial<RoomModel> = {}): RoomModel {
  const r = createDefaultRoom('conference');
  return { ...r, openings: [], columns: [], ...overrides };
}

describe('Parametric table dimensions', () => {
  it('custom dimensions 2.4 × 1.0 × 0.75 m are accepted', () => {
    const c = clampTableSpecSizes({ sizeX: 2.4, sizeZ: 1.0, height: 0.75 });
    expect(c.sizeX).toBe(2.4);
    expect(c.sizeZ).toBe(1.0);
    expect(c.height).toBe(0.75);
  });

  it('presets populate engineering defaults', () => {
    const small = tablePreset('small_conference');
    expect(small.sizeX).toBe(0.9);
    expect(small.sizeZ).toBe(1.6);
    const training = tablePreset('training');
    expect(training.sizeX).toBe(1.2);
    expect(training.sizeZ).toBe(0.55);
  });

  it('resizing a conference table moves chairs to the new edges', () => {
    const table = {
      id: 'conference-table',
      centerX: 0,
      centerZ: 0,
      sizeX: 1.2,
      sizeZ: 2.4,
      furnitureId: 'generic-conference' as const
    };
    const first = relayoutSeatsForTable(table, [], [table], 8);
    expect(first.placed).toBe(8);
    const grown = { ...table, sizeZ: 3.2 };
    const second = relayoutSeatsForTable(grown, first.seats, [grown], 8);
    const maxZ0 = Math.max(...first.seats.map((s) => Math.abs(s.z)));
    const maxZ1 = Math.max(...second.seats.map((s) => Math.abs(s.z)));
    expect(maxZ1).toBeGreaterThan(maxZ0);
    second.seats.forEach((s) => {
      expect(aabbsOverlap(chairAabb(s), tableAabb(grown), 0.04)).toBe(false);
    });
  });

  it('resizing a training table keeps chairs on the occupant edge', () => {
    const room = bareRoom({ width: 12, depth: 9 });
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(8, 'classroom'));
    const table = tables[0];
    const owned = seats.filter((s) => s.tableId === table.id);
    const wider = { ...table, sizeX: 1.8 };
    const next = relayoutSeatsForTable(wider, seats, tables.map((t) => (t.id === table.id ? wider : t)), owned.length);
    const mine = next.seats.filter((s) => s.tableId === table.id);
    expect(mine.length).toBe(owned.length);
    mine.forEach((s) => {
      expect(Math.abs(s.z - wider.centerZ)).toBeGreaterThan(wider.sizeZ / 2);
    });
  });

  it('excessive requested seating does not overlap chairs', () => {
    const table = {
      id: 't1',
      centerX: 0,
      centerZ: 0,
      sizeX: 1.2,
      sizeZ: 1.6,
      furnitureId: 'generic-small-meeting'
    };
    const practical = practicalSeatCapacity(table);
    expect(practical).toBeLessThan(16);
    const result = relayoutSeatsForTable(table, [], [table], 16);
    expect(result.placed).toBe(practical);
    expect(result.warning).toMatch(/Increase table dimensions|add another table/i);
    for (let i = 0; i < result.seats.length; i++) {
      for (let j = i + 1; j < result.seats.length; j++) {
        const dx = result.seats[i].x - result.seats[j].x;
        const dz = result.seats[i].z - result.seats[j].z;
        expect(Math.hypot(dx, dz)).toBeGreaterThan(0.45);
      }
    }
  });

  it('applyPresetToTable writes preset dimensions', () => {
    const table = { id: 't', centerX: 0, centerZ: 0, sizeX: 1, sizeZ: 1, furnitureId: 'generic-conference' };
    const next = applyPresetToTable(table, 'large_conference');
    expect(next.sizeX).toBe(1.4);
    expect(next.sizeZ).toBe(3.6);
    expect(matchTablePreset(next)).toBe('large_conference');
  });
});

describe('Parametric tables in AppState / Plan-3D data', () => {
  it('undo restores table size and chair positions', () => {
    const state = new AppState();
    const room = bareRoom({ width: 8, depth: 10 });
    state.setRoom(room);
    const gen = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    state.setSeats(gen.seats, gen.tables);
    const tableId = state.tables[0].id;
    const beforeSeats = JSON.stringify(state.seats.map((s) => ({ x: s.x, z: s.z })));
    const beforeZ = state.tables[0].sizeZ;
    state.updateTable(tableId, { sizeZ: beforeZ + 0.5 });
    expect(state.tables[0].sizeZ).toBeCloseTo(beforeZ + 0.5);
    expect(JSON.stringify(state.seats.map((s) => ({ x: s.x, z: s.z })))).not.toBe(beforeSeats);
    state.undo();
    expect(state.tables[0].sizeZ).toBeCloseTo(beforeZ);
    expect(JSON.stringify(state.seats.map((s) => ({ x: s.x, z: s.z })))).toBe(beforeSeats);
    state.redo();
    expect(state.tables[0].sizeZ).toBeCloseTo(beforeZ + 0.5);
  });

  it('FURN-008 warns when requested seats exceed practical capacity', () => {
    const state = new AppState();
    const room = bareRoom({ width: 8, depth: 10 });
    state.setRoom(room);
    const gen = generateSeating(room, defaultSeatingConfig(4, 'boardroom'));
    state.setSeats(gen.seats, gen.tables);
    state.setTableSeatCount(state.tables[0].id, 24);
    expect(state.seats.length).toBeLessThan(24);
    expect(state.tables[0].requestedSeats).toBe(24);
    const report = runDesignValidation({
      room,
      seats: state.seats,
      tables: state.tables,
      equipment: [],
      catalog: new EquipmentCatalog()
    });
    expect(report.findings.some((f) => f.code === 'FURN-008' && f.severity === 'warning')).toBe(true);
  });

  it('Plan/3D share TableSpec extents after a custom resize', () => {
    const state = new AppState();
    const room = bareRoom({ width: 8, depth: 10 });
    state.setRoom(room);
    const gen = generateSeating(room, defaultSeatingConfig(6, 'boardroom'));
    state.setSeats(gen.seats, gen.tables);
    state.updateTable(state.tables[0].id, { sizeX: 2.4, sizeZ: 1.0, height: 0.75 });
    const t = state.tables[0];
    expect(t.sizeX).toBe(2.4);
    expect(t.sizeZ).toBe(1.0);
    expect(t.height).toBe(0.75);
    const box = tableAabb(t);
    expect(box.maxX - box.minX).toBeCloseTo(2.4);
    expect(box.maxZ - box.minZ).toBeCloseTo(1.0);
  });
});
