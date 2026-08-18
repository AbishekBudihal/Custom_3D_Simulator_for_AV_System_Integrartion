import { describe, it, expect } from 'vitest';
import { generateSeating, defaultSeatingConfig } from '../../src/room/SeatingGenerator';
import { createDefaultRoom, type RoomModel } from '../../src/room/RoomModel';
import { conferenceWidthForCapacity } from '../../src/room/FurnitureCatalog';
import { runDesignValidation } from '../../src/av/validation/DesignValidationEngine';
import { EquipmentCatalog } from '../../src/catalog/EquipmentCatalog';
import { generateDesign } from '../../src/autodesign/DesignPipeline';
import { defaultQuickRequirements } from '../../src/autodesign/DesignRequirements';
import { loadDefaultCatalog } from '../../src/catalog/loadCatalog';
import { AppState } from '../../src/app/AppState';
import { furnitureFingerprint } from '../../src/app/HistoryManager';

function bareRoom(overrides: Partial<RoomModel> = {}): RoomModel {
  const r = createDefaultRoom('conference');
  return { ...r, openings: [], columns: [], ...overrides };
}

describe('Furniture-first conference layout', () => {
  const counts = [2, 6, 8, 12, 16] as const;

  counts.forEach((n) => {
    it(`${n} pax table width is occupancy-driven, not room-width`, () => {
      const room = bareRoom({ width: 10, depth: n >= 16 ? 9 : 8 });
      const { tables, seats, valid } = generateSeating(room, defaultSeatingConfig(n, 'boardroom'));
      expect(tables.length).toBe(1);
      expect(seats.length).toBe(n);
      expect(valid).toBe(true);
      expect(tables[0].sizeX).toBeCloseTo(conferenceWidthForCapacity(n), 3);
      expect(tables[0].sizeX).toBeLessThan(room.width * 0.45);
      expect(tables[0].centerX - tables[0].sizeX / 2).toBeGreaterThan(-room.width / 2 + 0.7);
    });
  });

  it('the same 6 seats produce a different envelope in a narrow room vs a square room', () => {
    const a = generateSeating(bareRoom({ width: 10, depth: 4.5 }), defaultSeatingConfig(6, 'boardroom'));
    const b = generateSeating(bareRoom({ width: 6, depth: 6 }), defaultSeatingConfig(6, 'boardroom'));
    expect(a.tables[0].sizeX).toBe(b.tables[0].sizeX);
    expect(Math.abs(a.tables[0].centerZ - b.tables[0].centerZ) > 0.05 || a.valid !== b.valid).toBe(true);
  });

  it('does not invent a layout when 16 seats cannot circulate in a small room', () => {
    const { valid, warnings, tables } = generateSeating(bareRoom({ width: 4.5, depth: 4.5 }), defaultSeatingConfig(16, 'boardroom'));
    expect(valid).toBe(false);
    expect(warnings.some((w) => w.includes('cannot be accommodated'))).toBe(true);
    expect(tables[0].sizeX).toBeLessThan(2);
  });
});

describe('Furniture validation FURN-001…008', () => {
  it('passes FURN codes for a fitted 8-person conference table', () => {
    const room = bareRoom({ width: 8, depth: 7 });
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    const report = runDesignValidation({ room, seats, tables, equipment: [], catalog: new EquipmentCatalog() });
    const furn = report.findings.filter((f) => f.code.startsWith('FURN-'));
    expect(furn.map((f) => f.code).sort()).toEqual(
      ['FURN-001', 'FURN-002', 'FURN-003', 'FURN-004', 'FURN-005', 'FURN-006', 'FURN-007', 'FURN-008'].sort()
    );
    furn.forEach((f) => expect(f.severity).toBe('pass'));
  });

  it('FURN-001 errors when a table is moved into a wall', () => {
    const room = bareRoom({ width: 8, depth: 7 });
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    const moved = [{ ...tables[0], centerX: room.width / 2 }];
    const report = runDesignValidation({ room, seats, tables: moved, equipment: [], catalog: new EquipmentCatalog() });
    expect(report.findings.some((f) => f.code === 'FURN-001' && f.severity === 'error')).toBe(true);
  });
});

describe('Auto Design furniture strategy', () => {
  it('explains conference layout for 12-person video conference', () => {
    const catalog = loadDefaultCatalog();
    const p = generateDesign(
      { room: null, seats: [], tables: [], equipment: [], connections: [], routes: [] },
      {
        ...defaultQuickRequirements(),
        completeMissingOnly: false,
        constraints: { ...defaultQuickRequirements().constraints, keepExistingSeating: false, keepExistingEquipment: false },
        useCase: 'video_conference',
        seating: { count: 12, layout: 'auto' },
        room: { width: 8, length: 10, height: 3 }
      },
      catalog
    );
    expect(p.status).toBe('ok');
    const why = p.options[0]?.why.join(' ') ?? '';
    expect(why.toLowerCase()).toMatch(/conference/);
    expect(why).toMatch(/12/);
    expect(p.options[0]!.tables[0].sizeX).toBeLessThan(2);
  });

  it('returns NO VALID LAYOUT for 16 seats in a 4×4 m room', () => {
    const catalog = loadDefaultCatalog();
    const p = generateDesign(
      { room: null, seats: [], tables: [], equipment: [], connections: [], routes: [] },
      {
        ...defaultQuickRequirements(),
        completeMissingOnly: false,
        constraints: { ...defaultQuickRequirements().constraints, keepExistingSeating: false, keepExistingEquipment: false },
        seating: { count: 16, layout: 'boardroom' },
        room: { width: 4, length: 4, height: 3 }
      },
      catalog
    );
    expect(p.status).toBe('no_valid_design');
    expect(p.blockingReason).toMatch(/NO VALID LAYOUT/);
    expect(p.options).toHaveLength(0);
  });
});

describe('TableSpec remains authoritative through move/undo', () => {
  it('does not infer a new table when the user moves furniture', () => {
    const room = bareRoom({ width: 8, depth: 7 });
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    const state = new AppState();
    state.setRoom(room);
    state.setSeats(seats, tables);
    const before = furnitureFingerprint({ room: state.room, seats: state.seats, tables: state.tables });
    const orig = { ...state.tables[0] };
    state.updateTable(orig.id, { centerX: orig.centerX + 0.4 });
    expect(state.tables.length).toBe(1);
    expect(state.tables[0].sizeX).toBe(orig.sizeX);
    expect(state.tables[0].sizeZ).toBe(orig.sizeZ);
    state.undo();
    expect(state.tables[0].centerX).toBeCloseTo(orig.centerX, 2);
    expect(furnitureFingerprint({ room: state.room, seats: state.seats, tables: state.tables })).toBe(before);
  });
});
