import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateSeatMicCoverage,
  pickupRegionFromMic,
  sampleMicCoverage,
  seatInsideMic,
  type MicPlacement
} from '../../src/av/MicrophoneCoverageEngine';
import { overlayLayerForFinding } from '../../src/av/simulation/AnalysisLayer';
import { EquipmentCatalog, type EquipmentProduct } from '../../src/catalog/EquipmentCatalog';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { runDesignValidation, ensureBuiltinChecksRegistered } from '../../src/av/validation/DesignValidationEngine';
import { resetValidationCache } from '../../src/av/validation/validationCache';
import { AppState } from '../../src/app/AppState';
import { resolveProjectMicrophones } from '../../src/av/MicAnalysis';

const sectorMic: MicPlacement = {
  id: 'DIR-1',
  x: 0,
  z: 0,
  pickupRadiusM: 3,
  coverageModel: 'directional_sector',
  beamWidthDeg: 60,
  facingRad: 0
};

const sectorProduct: EquipmentProduct = {
  id: 'mic-sector',
  manufacturer: 'User-supplied',
  model: 'Sector-60',
  category: 'microphone',
  type: 'gooseneck',
  physical: { width: 0.04, height: 0.4, depth: 0.04 },
  microphone: {
    mount: 'table',
    pickupRadiusM: 3,
    beamWidthDeg: 60,
    coverageModel: 'directional_sector',
    pattern: 'Horizontal sector',
    channels: 1,
    connection: 'XLR'
  },
  provenance: 'user_defined'
};

const sectorIncomplete: EquipmentProduct = {
  id: 'mic-sector-bad',
  manufacturer: 'User-supplied',
  model: 'Sector-missing-width',
  category: 'microphone',
  type: 'gooseneck',
  physical: { width: 0.04, height: 0.4, depth: 0.04 },
  microphone: {
    mount: 'table',
    pickupRadiusM: 3,
    coverageModel: 'directional_sector',
    pattern: 'Directional but no beam width in catalog',
    channels: 1,
    connection: 'XLR'
  },
  provenance: 'user_defined'
};

function catalogWith(products: EquipmentProduct[]): EquipmentCatalog {
  const c = new EquipmentCatalog();
  c.register(products);
  return c;
}

describe('C2a directional microphone', () => {
  beforeEach(() => {
    resetValidationCache();
    ensureBuiltinChecksRegistered();
  });

  it('covers a seat inside a valid beam width / facing sector', () => {
    const onAxis = { seatId: 'ON', x: 0, z: 2 };
    expect(seatInsideMic(onAxis, sectorMic)).toBe(true);
    const r = evaluateSeatMicCoverage(onAxis, [sectorMic]);
    expect(r.covered).toBe(true);
    expect(r.status).toBe('pass');
    expect(r.coveringModel).toBe('directional_sector');
  });

  it('does not cover a seat outside the sector at the same radius', () => {
    const offAxis = { seatId: 'OFF', x: 2, z: 0 };
    expect(Math.hypot(offAxis.x, offAxis.z)).toBeLessThan(sectorMic.pickupRadiusM);
    expect(seatInsideMic(offAxis, sectorMic)).toBe(false);
    const r = evaluateSeatMicCoverage(offAxis, [sectorMic]);
    expect(r.covered).toBe(false);
    expect(r.angularDeltaDeg).toBeGreaterThan(30);
  });

  it('rotating the microphone moves the calculated region', () => {
    const seat = { seatId: 'S', x: 2, z: 0 };
    expect(seatInsideMic(seat, sectorMic)).toBe(false);
    const rotated: MicPlacement = { ...sectorMic, facingRad: Math.PI / 2 };
    expect(seatInsideMic(seat, rotated)).toBe(true);
    expect(seatInsideMic({ seatId: 'OLD', x: 0, z: 2 }, rotated)).toBe(false);
  });

  it('heatmap cells use the same evaluator as seats', () => {
    const grid = sampleMicCoverage({ width: 8, depth: 8 }, [sectorMic], 'standard');
    const on = grid.cells.find((c) => Math.abs(c.x) < 0.4 && c.z > 1.2 && c.z < 2.2)!;
    const off = grid.cells.find((c) => c.x > 1.2 && c.x < 2.2 && Math.abs(c.z) < 0.4)!;
    expect(on.overall).toBe(evaluateSeatMicCoverage({ seatId: 'c', x: on.x, z: on.z }, [sectorMic]).status);
    expect(off.overall).toBe(evaluateSeatMicCoverage({ seatId: 'c', x: off.x, z: off.z }, [sectorMic]).status);
    expect(on.overall).toBe('pass');
    expect(off.overall).toBe('fail');
    expect(grid.method).toMatch(/directional sector/);
  });

  it('pickup region outline is a sector, not a full disc', () => {
    const region = pickupRegionFromMic(sectorMic);
    expect(region.kind).toBe('sector');
    expect(region.metadata.model).toBe('directional_sector');
    const xs = region.outline.map((p) => p.x);
    expect(Math.max(...xs)).toBeLessThan(sectorMic.pickupRadiusM * 0.9);
  });

  it('missing directional beam width is DATA INCOMPLETE (not a silent disc)', () => {
    const catalog = catalogWith([sectorIncomplete]);
    const resolved = resolveProjectMicrophones(
      [{ instanceId: 'm1', productId: 'mic-sector-bad', name: 'Bad', position: { x: 0, y: 1, z: 0 }, rotationY: 0 }],
      catalog
    );
    expect(resolved[0].incomplete).toBe(true);
    expect(resolved[0].incompleteKind).toBe('directional');
    expect(resolved[0].incompleteReason).toMatch(/DATA INCOMPLETE/);
    expect(resolved[0].coverageModel).not.toBe('pickup_disc');

    const report = runDesignValidation({
      room: createDefaultRoom('conference'),
      seats: [{ id: 'S1', row: 1, indexInRow: 1, x: 0, z: 1, facing: 0, hasTable: false }],
      tables: [],
      equipment: [
        { instanceId: 'm1', productId: 'mic-sector-bad', name: 'Bad', position: { x: 0, y: 1, z: 0 }, rotationY: 0 }
      ],
      catalog
    });
    const f = report.findings.find((x) => x.code === 'MIC-003')!;
    expect(f.severity).toBe('warning');
    expect(f.metric?.actual).toMatch(/INCOMPLETE/);
    expect(report.findings.some((x) => x.code === 'MIC-001')).toBe(false);
  });

  it('validation uses the same sector evaluator', () => {
    const catalog = catalogWith([sectorProduct]);
    const report = runDesignValidation({
      room: { ...createDefaultRoom('conference'), width: 10, depth: 10 },
      seats: [
        { id: 'ON', row: 1, indexInRow: 1, x: 0, z: 2, facing: 0, hasTable: false },
        { id: 'OFF', row: 1, indexInRow: 2, x: 2, z: 0, facing: 0, hasTable: false }
      ],
      tables: [],
      equipment: [
        { instanceId: 'm1', productId: 'mic-sector', name: 'Sector-60', position: { x: 0, y: 1, z: 0 }, rotationY: 0 }
      ],
      catalog
    });
    const f = report.findings.find((x) => x.code === 'MIC-001')!;
    expect(f.severity).toBe('error');
    expect(f.message).toMatch(/pickup region/);
    expect(f.affectedObjects.map((o) => o.id)).toContain('OFF');
    expect(f.affectedObjects.map((o) => o.id)).not.toContain('ON');
    expect(f.objectId).toBe('m1');
    expect(f.explanation).toMatch(/directional sector/);
  });

  it('View Issue routes MIC findings to the microphone overlay', () => {
    expect(overlayLayerForFinding('MIC-001')).toBe('microphone');
    expect(overlayLayerForFinding('MIC-003')).toBe('microphone');
    const state = new AppState();
    state.inspectFinding('MIC-001', ['OFF'], [], ['m1']);
    expect(state.micAnalysis.enabled).toBe(true);
    expect(state.micAnalysis.pickupRegions).toBe(true);
    expect(state.selection.id).toBe('m1');
    expect(state.highlightedSeatIds).toEqual(['OFF']);
  });
});
