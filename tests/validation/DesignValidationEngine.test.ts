import { describe, it, expect, beforeEach } from 'vitest';
import { AppState } from '../../src/app/AppState';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { defaultSeatingConfig, generateSeating } from '../../src/room/SeatingGenerator';
import { EquipmentCatalog, type EquipmentProduct } from '../../src/catalog/EquipmentCatalog';
import { runDesignValidation, focusTargetForFinding, ensureBuiltinChecksRegistered } from '../../src/av/validation/DesignValidationEngine';
import { validationRegistry } from '../../src/av/validation/ValidationRegistry';
import { BUILTIN_CHECKS } from '../../src/av/validation/builtinChecks';
import { SYSTEM_CHECKS } from '../../src/av/validation/systemChecks';
import { resetValidationCache, validationReportFromStateLike } from '../../src/av/validation/validationCache';
import { furnitureFingerprint } from '../../src/app/HistoryManager';

const displayProduct: EquipmentProduct = {
  id: 'disp-86',
  manufacturer: 'Acme',
  model: 'AC-86',
  category: 'display',
  type: 'display',
  physical: { width: 1.9, height: 1.1, depth: 0.06 },
  display: { diagonalInches: 86, resolution: '4K', aspectRatio: '16:9', brightnessNits: 500 },
  mounting: { wall: true, floor: false, ceiling: false },
  provenance: 'estimated'
};

const incompleteProduct: EquipmentProduct = {
  id: 'disp-bad',
  manufacturer: 'Acme',
  model: 'Unknown',
  category: 'display',
  type: 'display',
  physical: { width: 0, height: 0, depth: 0 },
  provenance: 'estimated'
};

function catalogWith(products: EquipmentProduct[]): EquipmentCatalog {
  const c = new EquipmentCatalog();
  c.register(products);
  return c;
}

describe('DesignValidationEngine', () => {
  beforeEach(() => {
    resetValidationCache();
    ensureBuiltinChecksRegistered();
  });

  it('registers stable check codes', () => {
    const codes = validationRegistry.list().map((c) => c.code);
    expect(codes).toEqual([...BUILTIN_CHECKS, ...SYSTEM_CHECKS].map((c) => c.code));
    expect(codes).toContain('VIEW-001');
    expect(codes).toContain('DISPLAY-001');
    expect(codes).toContain('SEAT-001');
    expect(codes).toContain('MIC-001');
    expect(codes).toContain('MIC-002');
    expect(codes).toContain('AUDIO-001');
    expect(codes).toContain('AUDIO-003');
    expect(codes).toContain('CAM-001');
    expect(codes).toContain('CAM-003');
  });

  it('emits DISPLAY-001 ERROR when no display is placed', () => {
    const report = runDesignValidation({
      room: createDefaultRoom('conference'),
      seats: [],
      tables: [],
      equipment: [],
      catalog: catalogWith([displayProduct])
    });
    const f = report.findings.find((x) => x.code === 'DISPLAY-001')!;
    expect(f.severity).toBe('error');
    expect(report.summary.errorCount).toBeGreaterThan(0);
    expect(report.summary.designStatus).toBe('attention');
  });

  it('emits DISPLAY-001 WARNING for incomplete physical data', () => {
    const report = runDesignValidation({
      room: createDefaultRoom('conference'),
      seats: [],
      tables: [],
      equipment: [
        {
          instanceId: 'e1',
          productId: 'disp-bad',
          name: 'Unknown',
          position: { x: 0, y: 1.6, z: -3 },
          rotationY: 0,
          wall: 'front'
        }
      ],
      catalog: catalogWith([incompleteProduct])
    });
    const f = report.findings.find((x) => x.code === 'DISPLAY-001')!;
    expect(f.severity).toBe('warning');
    expect(f.message.toLowerCase()).toMatch(/incomplete|missing/);
  });

  it('emits PASS findings for a valid on-axis seat', () => {
    const room = { ...createDefaultRoom('conference'), width: 10, depth: 7, openings: [], columns: [] };
    const catalog = catalogWith([displayProduct]);
    const report = runDesignValidation({
      room,
      seats: [{ id: 'MID', row: 1, indexInRow: 1, x: 0, z: -1, facing: 0, hasTable: false }],
      tables: [],
      equipment: [
        {
          instanceId: 'e1',
          productId: 'disp-86',
          name: 'AC-86',
          position: { x: 0, y: 1.65, z: -3.4 },
          rotationY: 0,
          wall: 'front'
        }
      ],
      catalog
    });
    expect(report.findings.some((f) => f.code === 'VIEW-001' && f.severity === 'pass')).toBe(true);
    expect(report.findings.some((f) => f.severity === 'pass')).toBe(true);
  });

  it('identifies affected seats for a viewing-distance ERROR', () => {
    const room = { ...createDefaultRoom('conference'), width: 10, depth: 7, openings: [], columns: [] };
    const report = runDesignValidation({
      room,
      seats: [{ id: 'FAR', row: 1, indexInRow: 1, x: 0, z: 20, facing: 0, hasTable: false }],
      tables: [],
      equipment: [
        {
          instanceId: 'e1',
          productId: 'disp-86',
          name: 'AC-86',
          position: { x: 0, y: 1.65, z: -3.4 },
          rotationY: 0,
          wall: 'front'
        }
      ],
      catalog: catalogWith([displayProduct])
    });
    const f = report.findings.find((x) => x.code === 'VIEW-001')!;
    expect(f.severity).toBe('error');
    expect(f.affectedObjects.map((o) => o.id)).toContain('FAR');
    expect(f.metric?.actual).toBeTruthy();
    const target = focusTargetForFinding(f, [
      { id: 'FAR', row: 1, indexInRow: 1, x: 0, z: 20, facing: 0, hasTable: false }
    ]);
    expect(target?.z).toBe(20);
  });

  it('flags sightline obstruction as VIEW-005 ERROR', () => {
    const room = {
      ...createDefaultRoom('conference'),
      width: 10,
      depth: 7,
      openings: [],
      columns: [{ x: 0, z: -0.5, width: 0.6, depth: 0.6 }]
    };
    const report = runDesignValidation({
      room,
      seats: [{ id: 'A', row: 1, indexInRow: 1, x: 0, z: 2, facing: 0, hasTable: false }],
      tables: [],
      equipment: [
        {
          instanceId: 'e1',
          productId: 'disp-86',
          name: 'AC-86',
          position: { x: 0, y: 1.65, z: -3.4 },
          rotationY: 0,
          wall: 'front'
        }
      ],
      catalog: catalogWith([displayProduct])
    });
    const f = report.findings.find((x) => x.code === 'VIEW-005')!;
    expect(f.severity).toBe('error');
    expect(f.affectedObjects.some((o) => o.id === 'A')).toBe(true);
  });

  it('recalculates after display movement — report signature changes', () => {
    const room = { ...createDefaultRoom('conference'), width: 10, depth: 7, openings: [], columns: [] };
    const catalog = catalogWith([displayProduct]);
    const base = {
      room,
      seats: [{ id: 'S', row: 1, indexInRow: 1, x: 0, z: 2, facing: 0, hasTable: false }],
      tables: [],
      catalog
    };
    const a = runDesignValidation({
      ...base,
      equipment: [
        { instanceId: 'e1', productId: 'disp-86', name: 'AC-86', position: { x: 0, y: 1.65, z: -3.4 }, rotationY: 0, wall: 'front' }
      ]
    });
    const b = runDesignValidation({
      ...base,
      equipment: [
        { instanceId: 'e1', productId: 'disp-86', name: 'AC-86', position: { x: 4, y: 1.65, z: -3.4 }, rotationY: 0, wall: 'front' }
      ]
    });
    expect(a.generatedFromSignature).not.toBe(b.generatedFromSignature);
  });

  it('undo restores geometry and validation is recomputed from restored state (not a stale report)', () => {
    const state = new AppState();
    const room = { ...createDefaultRoom('boardroom'), width: 10, depth: 7, openings: [], columns: [], presentationWall: 'front' as const };
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(12, 'boardroom'));
    state.setRoom(room);
    state.setSeats(seats, tables);
    state.clearHistory();
    const beforeFurniture = furnitureFingerprint(state);

    state.addEquipment({
      instanceId: 'e1',
      productId: 'disp-86',
      name: 'AC-86',
      position: { x: 0, y: 1.7, z: -3.4 },
      rotationY: 0,
      wall: 'front'
    });
    const catalog = catalogWith([displayProduct]);
    const afterAdd = runDesignValidation({
      room: state.room,
      seats: state.seats,
      tables: state.tables,
      equipment: state.equipment,
      catalog
    });

    state.updateEquipment('e1', { position: { x: 3, y: 1.7, z: -3.4 } });
    const afterMove = runDesignValidation({
      room: state.room,
      seats: state.seats,
      tables: state.tables,
      equipment: state.equipment,
      catalog
    });
    expect(afterMove.generatedFromSignature).not.toBe(afterAdd.generatedFromSignature);

    state.undo();
    expect(state.equipment[0].position.x).toBe(0);
    const afterUndo = runDesignValidation({
      room: state.room,
      seats: state.seats,
      tables: state.tables,
      equipment: state.equipment,
      catalog
    });
    expect(afterUndo.generatedFromSignature).toBe(afterAdd.generatedFromSignature);
    expect(furnitureFingerprint(state)).toBe(beforeFurniture);

    state.redo();
    expect(state.equipment[0].position.x).toBe(3);
    const afterRedo = validationReportFromStateLike(state);
    expect(afterRedo.generatedFromSignature).toBe(afterMove.generatedFromSignature);
    expect(furnitureFingerprint({ room: state.room, seats: state.seats, tables: state.tables })).toBe(beforeFurniture);
  });
});
