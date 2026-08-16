import { describe, it, expect, beforeEach } from 'vitest';
import { EquipmentCatalog, type EquipmentProduct } from '../../src/catalog/EquipmentCatalog';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { runDesignValidation, ensureBuiltinChecksRegistered, focusTargetForFinding } from '../../src/av/validation/DesignValidationEngine';
import { resetValidationCache } from '../../src/av/validation/validationCache';
import { AppState } from '../../src/app/AppState';
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

const micProduct: EquipmentProduct = {
  id: 'mic-ceil',
  manufacturer: 'Acme',
  model: 'Array-4.6',
  category: 'microphone',
  type: 'ceiling_array',
  physical: { width: 0.6, height: 0.04, depth: 0.6 },
  microphone: { mount: 'ceiling', pickupRadiusM: 4.6, pattern: 'Catalog disc radius', channels: 8, connection: 'Dante' },
  provenance: 'estimated'
};

const micIncomplete: EquipmentProduct = {
  id: 'mic-bad',
  manufacturer: 'Acme',
  model: 'Unknown',
  category: 'microphone',
  type: 'ceiling_array',
  physical: { width: 0.3, height: 0.04, depth: 0.3 },
  provenance: 'estimated'
};

function catalogWith(products: EquipmentProduct[]): EquipmentCatalog {
  const c = new EquipmentCatalog();
  c.register(products);
  return c;
}

describe('Microphone validation (Phase C1)', () => {
  beforeEach(() => {
    resetValidationCache();
    ensureBuiltinChecksRegistered();
  });

  it('does not emit MIC-001 when no microphones are placed', () => {
    const report = runDesignValidation({
      room: createDefaultRoom('conference'),
      seats: [{ id: 'S1', row: 1, indexInRow: 1, x: 0, z: 0, facing: 0, hasTable: false }],
      tables: [],
      equipment: [],
      catalog: catalogWith([micProduct, displayProduct])
    });
    expect(report.findings.some((f) => f.code === 'MIC-001')).toBe(false);
  });

  it('emits MIC-002 WARNING when pickupRadiusM is missing', () => {
    const report = runDesignValidation({
      room: createDefaultRoom('conference'),
      seats: [{ id: 'S1', row: 1, indexInRow: 1, x: 0, z: 0, facing: 0, hasTable: false }],
      tables: [],
      equipment: [
        { instanceId: 'm1', productId: 'mic-bad', name: 'Unknown', position: { x: 0, y: 2.7, z: 0 }, rotationY: 0 }
      ],
      catalog: catalogWith([micIncomplete])
    });
    const f = report.findings.find((x) => x.code === 'MIC-002')!;
    expect(f.severity).toBe('warning');
    expect(f.metric?.actual).toMatch(/INCOMPLETE/);
    expect(f.affectedObjects.some((o) => o.id === 'm1')).toBe(true);
  });

  it('emits MIC-001 ERROR for a seat outside the catalog pickup disc', () => {
    const report = runDesignValidation({
      room: { ...createDefaultRoom('conference'), width: 12, depth: 10 },
      seats: [{ id: 'FAR', row: 1, indexInRow: 1, x: 0, z: 8, facing: 0, hasTable: false }],
      tables: [],
      equipment: [
        { instanceId: 'm1', productId: 'mic-ceil', name: 'Array-4.6', position: { x: 0, y: 2.8, z: 0 }, rotationY: 0 }
      ],
      catalog: catalogWith([micProduct])
    });
    const f = report.findings.find((x) => x.code === 'MIC-001')!;
    expect(f.severity).toBe('error');
    expect(f.affectedObjects.map((o) => o.id)).toContain('FAR');
    expect(f.metric?.actual).toBeTruthy();
    const target = focusTargetForFinding(
      f,
      [{ id: 'FAR', row: 1, indexInRow: 1, x: 0, z: 8, facing: 0, hasTable: false }],
      [{ instanceId: 'm1', position: { x: 0, y: 2.8, z: 0 } }]
    );
    expect(target?.z).toBe(8);
  });

  it('emits MIC-001 PASS when the seat is inside the pickup disc', () => {
    const report = runDesignValidation({
      room: createDefaultRoom('conference'),
      seats: [{ id: 'NEAR', row: 1, indexInRow: 1, x: 1, z: 1, facing: 0, hasTable: false }],
      tables: [],
      equipment: [
        { instanceId: 'm1', productId: 'mic-ceil', name: 'Array-4.6', position: { x: 0, y: 2.8, z: 0 }, rotationY: 0 }
      ],
      catalog: catalogWith([micProduct])
    });
    expect(report.findings.some((f) => f.code === 'MIC-001' && f.severity === 'pass')).toBe(true);
    expect(report.findings.some((f) => f.code === 'MIC-002' && f.severity === 'pass')).toBe(true);
  });

  it('View issue enables mic overlays without mutating furniture', () => {
    const state = new AppState();
    const room = { ...createDefaultRoom('boardroom'), width: 10, depth: 7, openings: [], columns: [] };
    state.setRoom(room);
    state.setSeats([{ id: 'FAR', row: 1, indexInRow: 1, x: 0, z: 6, facing: 0, hasTable: false }], []);
    state.addEquipment({
      instanceId: 'm1',
      productId: 'mic-ceil',
      name: 'Array-4.6',
      position: { x: 0, y: 2.8, z: 0 },
      rotationY: 0
    });
    const before = furnitureFingerprint(state);
    state.inspectFinding('MIC-001', ['FAR'], [], ['m1']);
    expect(state.micAnalysis.enabled).toBe(true);
    expect(state.micAnalysis.pickupRegions).toBe(true);
    expect(state.highlightedSeatIds).toEqual(['FAR']);
    expect(state.selection.id).toBe('m1');
    expect(furnitureFingerprint(state)).toBe(before);
  });
});
