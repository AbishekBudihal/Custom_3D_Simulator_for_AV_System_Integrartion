import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateSeatCamera,
  sampleCameraCoverage,
  withinFov,
  type CameraPlacement,
  type CameraCoverageSeat
} from '../../src/av/CameraCoverageEngine';
import {
  resolveCameraFromCatalog,
  resolveProjectCameras,
  usableCameraPlacements
} from '../../src/av/CameraAnalysis';
import { overlayLayerForFinding } from '../../src/av/simulation/AnalysisLayer';
import { layoutFloorGrid } from '../../src/av/simulation/FloorGrid';
import { EquipmentCatalog, type EquipmentProduct } from '../../src/catalog/EquipmentCatalog';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { runDesignValidation, ensureBuiltinChecksRegistered } from '../../src/av/validation/DesignValidationEngine';
import { resetValidationCache } from '../../src/av/validation/validationCache';
import { AppState } from '../../src/app/AppState';
import type { Obstacle } from '../../src/av/SightlineEngine';

const cam: CameraPlacement = {
  id: 'CAM-1',
  x: 0,
  y: 1.6,
  z: -4,
  facingRad: 0,
  horizontalFovDeg: 81.9
};

const onAxis: CameraCoverageSeat = { seatId: 'ON', x: 0, z: 2, earHeightM: 1.1 };
const offAxis: CameraCoverageSeat = { seatId: 'OFF', x: 8, z: -4, earHeightM: 1.1 };

const validProduct: EquipmentProduct = {
  id: 'cam-ok',
  manufacturer: 'Acme',
  model: 'HFOV-81',
  category: 'camera',
  type: 'wall_camera',
  physical: { width: 0.12, height: 0.08, depth: 0.08 },
  camera: { mount: 'wall', horizontalFovDeg: 81.9, verticalFovDeg: 52.2 },
  mounting: { wall: true, floor: false, ceiling: false },
  provenance: 'user_defined'
};

const noHfov: EquipmentProduct = {
  id: 'cam-nohfov',
  manufacturer: 'Acme',
  model: 'NoFOV',
  category: 'camera',
  type: 'wall_camera',
  physical: { width: 0.12, height: 0.08, depth: 0.08 },
  camera: { mount: 'wall' },
  mounting: { wall: true, floor: false, ceiling: false },
  provenance: 'user_defined'
};

const column: Obstacle = { id: 'column:0', x: 0, z: 0, topHeightM: 3, radius: 0.35 };

function catalogWith(products: EquipmentProduct[]): EquipmentCatalog {
  const c = new EquipmentCatalog();
  c.register(products);
  return c;
}

describe('C3 camera geometric frustum', () => {
  beforeEach(() => {
    resetValidationCache();
    ensureBuiltinChecksRegistered();
  });

  it('accepts a valid catalog horizontal FOV', () => {
    const resolved = resolveCameraFromCatalog(validProduct.camera, {
      instanceId: 'c1',
      productId: validProduct.id,
      name: 'HFOV-81',
      position: { x: 0, y: 1.6, z: -4 },
      rotationY: 0
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.placement.horizontalFovDeg).toBe(81.9);
      expect(resolved.placement.verticalFovDeg).toBe(52.2);
    }
  });

  it('covers a seat inside horizontal FOV', () => {
    expect(withinFov(cam, onAxis)).toBe(true);
    const r = evaluateSeatCamera(onAxis, [cam], []);
    expect(r.inFov).toBe(true);
    expect(r.visible).toBe(true);
    expect(r.status).toBe('pass');
    expect(r.coveringCameraIds).toContain('CAM-1');
  });

  it('rejects a seat outside horizontal FOV', () => {
    expect(withinFov(cam, offAxis)).toBe(false);
    const r = evaluateSeatCamera(offAxis, [cam], []);
    expect(r.inFov).toBe(false);
    expect(r.visible).toBe(false);
    expect(r.sightline).toBe('n/a');
    expect(r.status).toBe('fail');
  });

  it('changes coverage when the camera is rotated', () => {
    expect(withinFov(cam, offAxis)).toBe(false);
    const rotated = { ...cam, facingRad: Math.PI / 2 };
    expect(withinFov(rotated, offAxis)).toBe(true);
    expect(withinFov(rotated, onAxis)).toBe(false);
  });

  it('does not invent HFOV when catalog data is missing', () => {
    const resolved = resolveCameraFromCatalog(noHfov.camera, {
      instanceId: 'c1',
      productId: noHfov.id,
      name: 'NoFOV',
      position: { x: 0, y: 1.6, z: -4 },
      rotationY: 0
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reason).toMatch(/DATA INCOMPLETE/);
    const list = resolveProjectCameras(
      [{ instanceId: 'c1', productId: 'cam-nohfov', name: 'NoFOV', position: { x: 0, y: 1.6, z: -4 }, rotationY: 0 }],
      catalogWith([noHfov])
    );
    expect(usableCameraPlacements(list)).toHaveLength(0);
    expect(list[0].incompleteReason).not.toMatch(/90/);
  });

  it('blocks a sightline with a column while the seat remains in FOV', () => {
    expect(withinFov(cam, onAxis)).toBe(true);
    const r = evaluateSeatCamera(onAxis, [cam], [column]);
    expect(r.inFov).toBe(true);
    expect(r.sightline).toBe('blocked');
    expect(r.visible).toBe(false);
    expect(r.status).toBe('fail');
    expect(r.overall).toBe('warning');
    expect(r.blockingCameraIds).toContain('CAM-1');
  });

  it('validation CAM-004 uses in-FOV plus blocked sightline', () => {
    const room = { ...createDefaultRoom('conference'), columns: [{ x: 0, z: 0, width: 0.5, depth: 0.5 }] };
    const report = runDesignValidation({
      room,
      seats: [{ id: 'ON', row: 1, indexInRow: 1, x: 0, z: 2, facing: 0, hasTable: false }],
      tables: [],
      equipment: [
        { instanceId: 'c1', productId: 'cam-ok', name: 'HFOV-81', position: { x: 0, y: 1.6, z: -4 }, rotationY: 0 }
      ],
      catalog: catalogWith([validProduct])
    });
    const f = report.findings.find((x) => x.code === 'CAM-004')!;
    expect(f.severity).toBe('error');
    expect(f.affectedObjects.map((o) => o.id)).toContain('ON');
  });

  it('reports CAM-002 when zero seats are visible', () => {
    const report = runDesignValidation({
      room: createDefaultRoom('conference'),
      seats: [{ id: 'BEHIND', row: 1, indexInRow: 1, x: 0, z: -6, facing: 0, hasTable: false }],
      tables: [],
      equipment: [
        { instanceId: 'c1', productId: 'cam-ok', name: 'HFOV-81', position: { x: 0, y: 1.6, z: -4 }, rotationY: 0 }
      ],
      catalog: catalogWith([validProduct])
    });
    expect(report.findings.find((x) => x.code === 'CAM-002')?.severity).toBe('error');
  });

  it('covers seats with a union of multiple cameras', () => {
    const a: CameraPlacement = { id: 'A', x: 0, y: 1.6, z: 0, facingRad: 0, horizontalFovDeg: 81.9 };
    const b: CameraPlacement = { id: 'B', x: 0, y: 1.6, z: 0, facingRad: Math.PI, horizontalFovDeg: 81.9 };
    const seatA: CameraCoverageSeat = { seatId: 'SA', x: 0, z: 3, earHeightM: 1.1 };
    const seatB: CameraCoverageSeat = { seatId: 'SB', x: 0, z: -3, earHeightM: 1.1 };
    expect(evaluateSeatCamera(seatA, [a], []).visible).toBe(true);
    expect(evaluateSeatCamera(seatA, [b], []).visible).toBe(false);
    expect(evaluateSeatCamera(seatA, [a, b], []).coveringCameraIds).toEqual(['A']);
    expect(evaluateSeatCamera(seatB, [a, b], []).coveringCameraIds).toEqual(['B']);
  });

  it('samples the floor through FloorGrid', () => {
    const layout = layoutFloorGrid({ width: 8, depth: 6 }, 'standard');
    const grid = sampleCameraCoverage({ width: 8, depth: 6 }, [cam], [], 'standard');
    expect(grid.cells).toHaveLength(layout.points.length);
    expect(grid.cells[0].x).toBeCloseTo(layout.points[0].x, 8);
  });

  it('heatmap cells use the same evaluateSeatCamera overall status', () => {
    const grid = sampleCameraCoverage({ width: 10, depth: 10 }, [cam], [], 'standard');
    const cell = grid.cells[0];
    const seat = evaluateSeatCamera({ seatId: 'cell', x: cell.x, z: cell.z, earHeightM: 1.1 }, [cam], []);
    expect(cell.overall).toBe(seat.overall);
    expect(cell.visible).toBe(seat.visible);
  });

  it('validation CAM-001 uses the same FOV evaluator', () => {
    const report = runDesignValidation({
      room: createDefaultRoom('conference'),
      seats: [
        { id: 'ON', row: 1, indexInRow: 1, x: 0, z: 2, facing: 0, hasTable: false },
        { id: 'OFF', row: 1, indexInRow: 2, x: 8, z: -4, facing: 0, hasTable: false }
      ],
      tables: [],
      equipment: [
        { instanceId: 'c1', productId: 'cam-ok', name: 'HFOV-81', position: { x: 0, y: 1.6, z: -4 }, rotationY: 0 }
      ],
      catalog: catalogWith([validProduct])
    });
    const f = report.findings.find((x) => x.code === 'CAM-001')!;
    expect(f.severity).toBe('error');
    expect(f.affectedObjects.map((o) => o.id)).toContain('OFF');
    expect(f.affectedObjects.map((o) => o.id)).not.toContain('ON');
  });

  it('View Issue routes CAM findings to the camera overlay', () => {
    expect(overlayLayerForFinding('CAM-001')).toBe('camera');
    expect(overlayLayerForFinding('CAM-004')).toBe('camera');
    const state = new AppState();
    state.inspectFinding('CAM-001', ['OFF'], [], ['c1']);
    expect(state.cameraAnalysis.enabled).toBe(true);
    expect(state.cameraAnalysis.fovRegions).toBe(true);
    expect(state.selection.id).toBe('c1');
    expect(state.highlightedSeatIds).toEqual(['OFF']);
  });

  it('moving a camera changes calculated coverage', () => {
    expect(evaluateSeatCamera(onAxis, [cam], []).visible).toBe(true);
    const movedAway = { ...cam, z: 8 };
    expect(evaluateSeatCamera(onAxis, [movedAway], []).visible).toBe(false);
  });

  it('undo restores camera geometry and omits overlay flags from snapshots', () => {
    const state = new AppState();
    state.setRoom(createDefaultRoom('conference'));
    state.addEquipment({
      instanceId: 'c1',
      productId: 'yealink-uvc84',
      name: 'Cam',
      position: { x: 0, y: 1.6, z: -4 },
      rotationY: 0
    });
    state.updateEquipment('c1', { position: { x: 1, y: 1.6, z: -4 }, rotationY: 0.5 });
    expect(state.equipment[0].position.x).toBe(1);
    expect(state.equipment[0].rotationY).toBe(0.5);
    state.enableCameraAnalysis();
    state.undo();
    expect(state.equipment[0].position.x).toBe(0);
    expect(state.equipment[0].rotationY).toBe(0);
    const snap = state.captureSnapshot() as unknown as Record<string, unknown>;
    expect(snap.cameraAnalysis).toBeUndefined();
  });

  it('emits CAM-003 when HFOV is missing', () => {
    const report = runDesignValidation({
      room: createDefaultRoom('conference'),
      seats: [{ id: 'S1', row: 1, indexInRow: 1, x: 0, z: 0, facing: 0, hasTable: false }],
      tables: [],
      equipment: [
        { instanceId: 'c1', productId: 'cam-nohfov', name: 'NoFOV', position: { x: 0, y: 1.6, z: -4 }, rotationY: 0 }
      ],
      catalog: catalogWith([noHfov])
    });
    const f = report.findings.find((x) => x.code === 'CAM-003')!;
    expect(f.severity).toBe('warning');
    expect(f.metric?.actual).toMatch(/INCOMPLETE/);
  });
});
