import { describe, it, expect, beforeEach } from 'vitest';
import {
  combineSplIncoherent,
  coverageRegionFromSpeaker,
  evaluateSeatAudio,
  sampleSpeakerCoverage,
  splAtDistance,
  withinDispersion,
  type CoverageSeat,
  type SpeakerPlacement
} from '../../src/av/SpeakerCoverageEngine';
import {
  resolveProjectSpeakers,
  resolveSpeakerFromCatalog,
  usableSpeakerPlacements
} from '../../src/av/SpeakerAnalysis';
import { overlayLayerForFinding } from '../../src/av/simulation/AnalysisLayer';
import { layoutFloorGrid } from '../../src/av/simulation/FloorGrid';
import { EquipmentCatalog, type EquipmentProduct } from '../../src/catalog/EquipmentCatalog';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { runDesignValidation, ensureBuiltinChecksRegistered } from '../../src/av/validation/DesignValidationEngine';
import { resetValidationCache } from '../../src/av/validation/validationCache';
import { AppState } from '../../src/app/AppState';

const ceiling: SpeakerPlacement = {
  id: 'SP-CEIL',
  x: 0,
  y: 3,
  z: 0,
  mount: 'ceiling',
  facingRad: 0,
  dispersionDeg: 60,
  maxSplAt1m: 100
};

const wall: SpeakerPlacement = {
  id: 'SP-WALL',
  x: 0,
  y: 1.8,
  z: 0,
  mount: 'wall',
  facingRad: 0,
  dispersionDeg: 60,
  maxSplAt1m: 100
};

const validProduct: EquipmentProduct = {
  id: 'spk-ok',
  manufacturer: 'Acme',
  model: 'XYZ',
  category: 'speaker',
  type: 'ceiling_speaker',
  physical: { width: 0.2, height: 0.12, depth: 0.2 },
  speaker: { mount: 'ceiling', dispersionDeg: 90, maxSplAt1m: 95 },
  provenance: 'user_defined'
};

const noSpl: EquipmentProduct = {
  id: 'spk-nospl',
  manufacturer: 'Acme',
  model: 'NoSPL',
  category: 'speaker',
  type: 'ceiling_speaker',
  physical: { width: 0.2, height: 0.12, depth: 0.2 },
  speaker: { mount: 'ceiling', dispersionDeg: 90 },
  provenance: 'user_defined'
};

const noDisp: EquipmentProduct = {
  id: 'spk-nodisp',
  manufacturer: 'Acme',
  model: 'NoDisp',
  category: 'speaker',
  type: 'ceiling_speaker',
  physical: { width: 0.2, height: 0.12, depth: 0.2 },
  speaker: { mount: 'ceiling', maxSplAt1m: 100 },
  provenance: 'user_defined'
};

const quietProduct: EquipmentProduct = {
  id: 'spk-quiet',
  manufacturer: 'Acme',
  model: 'Quiet',
  category: 'speaker',
  type: 'ceiling_speaker',
  physical: { width: 0.2, height: 0.12, depth: 0.2 },
  speaker: { mount: 'ceiling', dispersionDeg: 160, maxSplAt1m: 72 },
  provenance: 'user_defined'
};

function catalogWith(products: EquipmentProduct[]): EquipmentCatalog {
  const c = new EquipmentCatalog();
  c.register(products);
  return c;
}

describe('C2b speaker coverage engine', () => {
  beforeEach(() => {
    resetValidationCache();
    ensureBuiltinChecksRegistered();
  });

  it('accepts a valid speaker model with catalog SPL and dispersion', () => {
    const resolved = resolveSpeakerFromCatalog(validProduct.speaker, {
      instanceId: 's1',
      productId: validProduct.id,
      name: 'XYZ',
      position: { x: 0, y: 2.7, z: 0 },
      rotationY: 0
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.placement.maxSplAt1m).toBe(95);
      expect(resolved.placement.dispersionDeg).toBe(90);
    }
  });

  it('calculates free-field level from max SPL at 1 m', () => {
    expect(splAtDistance(100, 1)).toBeCloseTo(100, 5);
    expect(splAtDistance(100, 10)).toBeCloseTo(80, 5);
    expect(splAtDistance(100, 2)).toBeCloseTo(100 - 20 * Math.log10(2), 5);
  });

  it('accepts a floor point inside catalog dispersion', () => {
    const inside: CoverageSeat = { seatId: 'IN', x: 0.4, z: 0, earHeightM: 1.1 };
    expect(withinDispersion(ceiling, inside)).toBe(true);
    const r = evaluateSeatAudio(inside, [ceiling]).value;
    expect(r.inDispersion).toBe(true);
    expect(r.splAtSeat).not.toBeNull();
  });

  it('rejects a floor point outside catalog dispersion (not the same coverage as inside)', () => {
    const far: CoverageSeat = { seatId: 'OUT', x: 8, z: 0, earHeightM: 1.1 };
    expect(withinDispersion(ceiling, far)).toBe(false);
    const r = evaluateSeatAudio(far, [ceiling]).value;
    expect(r.inDispersion).toBe(false);
    expect(r.splAtSeat).toBeNull();
    expect(r.status).toBe('fail');
  });

  it('changes wall-speaker coverage when orientation changes', () => {
    const onAxis: CoverageSeat = { seatId: 'ON', x: 0, z: 3, earHeightM: 1.1 };
    const offAxis: CoverageSeat = { seatId: 'OFF', x: 3, z: 0, earHeightM: 1.1 };
    expect(withinDispersion(wall, onAxis)).toBe(true);
    expect(withinDispersion(wall, offAxis)).toBe(false);
    const rotated = { ...wall, facingRad: Math.PI / 2 };
    expect(withinDispersion(rotated, offAxis)).toBe(true);
    expect(withinDispersion(rotated, onAxis)).toBe(false);
    const region0 = coverageRegionFromSpeaker(wall)!;
    const regionR = coverageRegionFromSpeaker(rotated)!;
    expect(region0.kind).toBe('sector');
    expect(region0.outline).not.toEqual(regionR.outline);
  });

  it('passes seats inside the 70–100 dB engineering band', () => {
    const near: CoverageSeat = { seatId: 'NEAR', x: 0, z: 0, earHeightM: 1.1 };
    const r = evaluateSeatAudio(near, [{ ...ceiling, maxSplAt1m: 90, dispersionDeg: 160 }]).value;
    expect(r.splAtSeat).not.toBeNull();
    expect(r.splAtSeat!).toBeGreaterThanOrEqual(70);
    expect(r.splAtSeat!).toBeLessThanOrEqual(100);
    expect(r.status).toBe('pass');
  });

  it('fails seats below the configured SPL threshold while still in dispersion', () => {
    const far: CoverageSeat = { seatId: 'FAR', x: 4, z: 0, earHeightM: 1.1 };
    const quiet: SpeakerPlacement = { ...ceiling, dispersionDeg: 160, maxSplAt1m: 72 };
    expect(withinDispersion(quiet, far)).toBe(true);
    const r = evaluateSeatAudio(far, [quiet]).value;
    expect(r.inDispersion).toBe(true);
    expect(r.splAtSeat!).toBeLessThan(70);
    expect(r.status).toBe('fail');
  });

  it('does not invent max SPL when catalog data is missing', () => {
    const resolved = resolveSpeakerFromCatalog(noSpl.speaker, {
      instanceId: 's1',
      productId: noSpl.id,
      name: 'NoSPL',
      position: { x: 0, y: 2.7, z: 0 },
      rotationY: 0
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.kind).toBe('spl');
      expect(resolved.reason).toMatch(/DATA INCOMPLETE/);
    }
    const catalog = catalogWith([noSpl]);
    const list = resolveProjectSpeakers(
      [{ instanceId: 's1', productId: 'spk-nospl', name: 'NoSPL', position: { x: 0, y: 2.7, z: 0 }, rotationY: 0 }],
      catalog
    );
    expect(usableSpeakerPlacements(list)).toHaveLength(0);
    expect(list[0].incompleteReason).not.toMatch(/100 dB/);
  });

  it('does not invent dispersion when catalog data is missing', () => {
    const resolved = resolveSpeakerFromCatalog(noDisp.speaker, {
      instanceId: 's1',
      productId: noDisp.id,
      name: 'NoDisp',
      position: { x: 0, y: 2.7, z: 0 },
      rotationY: 0
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.kind).toBe('dispersion');
      expect(resolved.reason).toMatch(/DATA INCOMPLETE/);
    }
  });

  it('combines multiple in-dispersion speakers with incoherent intensity, not linear dB add', () => {
    const seat: CoverageSeat = { seatId: 'S', x: 0, z: 0, earHeightM: 1.1 };
    const a: SpeakerPlacement = { ...ceiling, id: 'A', maxSplAt1m: 90, dispersionDeg: 160 };
    const b: SpeakerPlacement = { ...ceiling, id: 'B', x: 0.2, maxSplAt1m: 90, dispersionDeg: 160 };
    const one = evaluateSeatAudio(seat, [a]).value.splAtSeat!;
    const two = evaluateSeatAudio(seat, [a, b]).value.splAtSeat!;
    expect(two).toBeGreaterThan(one);
    expect(two).not.toBeCloseTo(one + one, 0);
    const incoherent = combineSplIncoherent([one, one]);
    expect(incoherent).toBeCloseTo(one + 10 * Math.log10(2), 0);
  });

  it('samples the floor through FloorGrid, not a second grid loop', () => {
    const layout = layoutFloorGrid({ width: 8, depth: 6 }, 'standard');
    const grid = sampleSpeakerCoverage({ width: 8, depth: 6 }, [ceiling], 'standard');
    expect(grid.cells).toHaveLength(layout.points.length);
    expect(grid.cols).toBe(layout.cols);
    expect(grid.rows).toBe(layout.rows);
    expect(grid.cells[0].x).toBeCloseTo(layout.points[0].x, 8);
    expect(grid.cells[0].z).toBeCloseTo(layout.points[0].z, 8);
  });

  it('heatmap cells use the same evaluateSeatAudio status as seats', () => {
    const grid = sampleSpeakerCoverage({ width: 10, depth: 10 }, [ceiling], 'standard');
    const cell = grid.cells.find((c) => Math.hypot(c.x, c.z) < 0.4)!;
    const seat = evaluateSeatAudio(
      { seatId: 'cell', x: cell.x, z: cell.z, earHeightM: 1.1 },
      [ceiling]
    ).value;
    expect(cell.overall).toBe(seat.status);
    expect(cell.splAtSeat).toBe(seat.splAtSeat);
  });

  it('validation AUDIO-003 uses the same incomplete catalog gate', () => {
    const report = runDesignValidation({
      room: createDefaultRoom('conference'),
      seats: [{ id: 'S1', row: 1, indexInRow: 1, x: 0, z: 0, facing: 0, hasTable: false }],
      tables: [],
      equipment: [
        { instanceId: 's1', productId: 'spk-nospl', name: 'NoSPL', position: { x: 0, y: 2.7, z: 0 }, rotationY: 0 }
      ],
      catalog: catalogWith([noSpl])
    });
    const f = report.findings.find((x) => x.code === 'AUDIO-003')!;
    expect(f.severity).toBe('warning');
    expect(f.metric?.actual).toMatch(/INCOMPLETE/);
    expect(report.findings.some((x) => x.code === 'AUDIO-001' && x.severity !== 'pass')).toBe(false);
  });

  it('validation AUDIO-001 uses the same SPL evaluator', () => {
    const report = runDesignValidation({
      room: { ...createDefaultRoom('conference'), width: 12, depth: 12 },
      seats: [{ id: 'FAR', row: 1, indexInRow: 1, x: 4, z: 0, facing: 0, hasTable: false }],
      tables: [],
      equipment: [
        { instanceId: 's1', productId: 'spk-quiet', name: 'Quiet', position: { x: 0, y: 3, z: 0 }, rotationY: 0 }
      ],
      catalog: catalogWith([quietProduct])
    });
    const engine = evaluateSeatAudio(
      { seatId: 'FAR', x: 4, z: 0, earHeightM: 1.1 },
      usableSpeakerPlacements(
        resolveProjectSpeakers(
          [{ instanceId: 's1', productId: 'spk-quiet', name: 'Quiet', position: { x: 0, y: 3, z: 0 }, rotationY: 0 }],
          catalogWith([quietProduct])
        )
      )
    ).value;
    expect(engine.status).toBe('fail');
    const f = report.findings.find((x) => x.code === 'AUDIO-001')!;
    expect(f.severity).toBe('error');
    expect(f.affectedObjects.map((o) => o.id)).toContain('FAR');
  });

  it('View Issue routes AUDIO findings to the speaker overlay', () => {
    expect(overlayLayerForFinding('AUDIO-001')).toBe('audio');
    expect(overlayLayerForFinding('AUDIO-003')).toBe('audio');
    const state = new AppState();
    state.inspectFinding('AUDIO-001', ['FAR'], [], ['s1']);
    expect(state.audioAnalysis.enabled).toBe(true);
    expect(state.audioAnalysis.coverageRegions).toBe(true);
    expect(state.audioAnalysis.heatmap).toBe(true);
    expect(state.selection.id).toBe('s1');
    expect(state.highlightedSeatIds).toEqual(['FAR']);
  });

  it('undo snapshots omit audio analysis view flags', () => {
    const state = new AppState();
    state.enableAudioAnalysis();
    const snap = state.captureSnapshot() as unknown as Record<string, unknown>;
    expect(snap.audioAnalysis).toBeUndefined();
  });
});
