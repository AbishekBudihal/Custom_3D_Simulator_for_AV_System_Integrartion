import { describe, it, expect } from 'vitest';
import {
  cellWorld,
  contourPolylines,
  fieldFromCells,
  pointInFurniture,
  pointInRoom,
  sampleField
} from '../../src/av/simulation/SpatialField';
import { occupantFromSeat, occupantEyeWorld } from '../../src/av/simulation/OccupantPoint';
import { evaluateSightline, evaluateSightlineDetailed } from '../../src/av/SightlineEngine';
import { sampleDisplayCoverage } from '../../src/av/DisplayCoverageEngine';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { analyzeSeatAgainstDisplay, projectObstacles } from '../../src/av/DesignAnalysis';
import { runDesignValidation } from '../../src/av/validation/DesignValidationEngine';
import { EquipmentCatalog, type EquipmentInstance, type EquipmentProduct } from '../../src/catalog/EquipmentCatalog';
import { cachedCoverage } from '../../src/av/coverageCache';
import type { DisplayPlacement } from '../../src/av/ViewingDistanceEngine';
import { rasterizeCoverageGrid, colorForScore, statusScore } from '../../src/av/HeatmapEngine';
import { withinHorizontalFov, type CameraPlacement } from '../../src/av/CameraCoverageEngine';
import { defaultFloorRack } from '../../src/av/AVRack';

const display: DisplayPlacement = {
  diagonalInches: 86,
  aspectRatio: '16:9',
  widthM: 1.9,
  heightM: 1.07,
  position: { x: 0, y: 1.65, z: -3.4 },
  wall: 'front',
  rotationY: 0
};

describe('Occupant points', () => {
  it('uses seated eye height, not the chair mesh origin', () => {
    const occ = occupantFromSeat({ id: 'S1', row: 1, indexInRow: 1, x: 1, z: 2, facing: 0, hasTable: true });
    expect(occ.eyeHeightM).toBe(1.1);
    expect(occupantEyeWorld({ id: 'S1', row: 1, indexInRow: 1, x: 1, z: 2, facing: 0, hasTable: true }).y).toBe(1.1);
  });
});

describe('Spatial field', () => {
  it('clips samples outside the room', () => {
    const field = fieldFromCells({ width: 8, depth: 6 }, 4, 3, []);
    expect(pointInRoom(8, 6, 0, 0)).toBe(true);
    expect(sampleField(field, 10, 0)).toBeNull();
  });

  it('interpolates between neighboring cell scores', () => {
    const cells = [
      { col: 0, row: 0, x: 0, z: 0, overall: 'fail' as const, score: 0 },
      { col: 1, row: 0, x: 0, z: 0, overall: 'pass' as const, score: 1 },
      { col: 0, row: 1, x: 0, z: 0, overall: 'fail' as const, score: 0 },
      { col: 1, row: 1, x: 0, z: 0, overall: 'pass' as const, score: 1 }
    ];
    const field = fieldFromCells({ width: 2, depth: 2 }, 2, 2, cells);
    const mid = sampleField(field, 0, 0);
    expect(mid).not.toBeNull();
    expect(mid!).toBeGreaterThan(0.2);
    expect(mid!).toBeLessThan(0.8);
  });

  it('does not sample through furniture footprints', () => {
    expect(pointInFurniture(0, 0, [{ id: 't', centerX: 0, centerZ: 0, sizeX: 2, sizeZ: 1 }])).toBe(true);
    const cells = [{ col: 0, row: 0, x: 0, z: 0, overall: 'pass' as const, score: 1, masked: true }];
    const field = fieldFromCells({ width: 4, depth: 4 }, 1, 1, cells, [
      { id: 't', centerX: 0, centerZ: 0, sizeX: 2, sizeZ: 1 }
    ]);
    expect(sampleField(field, 0, 0)).toBeNull();
  });

  it('emits contour segments from the calculated field', () => {
    const cells = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const { x, z } = cellWorld(6, 6, 6, 6, c, r);
        const score = x < 0 ? 0.2 : 0.9;
        cells.push({ col: c, row: r, x, z, overall: score > 0.5 ? ('pass' as const) : ('fail' as const), score });
      }
    }
    const field = fieldFromCells({ width: 6, depth: 6 }, 6, 6, cells);
    const lines = contourPolylines(field, [0.5]);
    expect(lines[0]?.points.length).toBeGreaterThan(4);
  });
});

describe('Heatmap raster', () => {
  it('maps scores continuously rather than three flat colors only', () => {
    const a = colorForScore(0.25);
    const b = colorForScore(0.75);
    expect(a[0]).not.toBe(b[0]);
    expect(statusScore('warning')).toBe(0.5);
  });

  it('returns null dataUrl in non-DOM tests without throwing', () => {
    const img = rasterizeCoverageGrid(
      [
        { col: 0, row: 0, overall: 'pass' },
        { col: 1, row: 0, overall: 'fail' }
      ],
      2,
      1
    );
    expect(img.width).toBeGreaterThan(0);
  });
});

describe('Sightline obstruction', () => {
  it('reports a hit point when a table blocks the ray', () => {
    const detailed = evaluateSightlineDetailed(
      { seatId: 'S', x: 0, z: 3, eyeHeightM: 1.1 },
      { x: 0, z: -3, y: 1.6 },
      [{ id: 'table:1', x: 0, z: 0, topHeightM: 1.5, radius: 0.4 }]
    );
    expect(detailed.result.value).toBe('blocked');
    expect(detailed.hit?.obstacleId).toBe('table:1');
    expect(Math.abs(detailed.hit!.z)).toBeLessThan(0.5);
    expect(evaluateSightline({ seatId: 'S', x: 0, z: 3, eyeHeightM: 1.1 }, { x: 0, z: -3, y: 1.6 }, []).value).toBe(
      'clear'
    );
  });
});

describe('Display coverage field', () => {
  it('classifies a floor sample with the same engine as a seat at that point', () => {
    const room = { ...createDefaultRoom('conference'), width: 10, depth: 8, openings: [], columns: [] };
    const grid = sampleDisplayCoverage(room, display, [], 'standard');
    const cell = grid.cells.find((c) => Math.hypot(c.x, c.z - 2) < 0.6)!;
    const seat = { id: 'probe', row: 1, indexInRow: 1, x: cell.x, z: cell.z, facing: 0, hasTable: false };
    expect(cell.overall).toBe(analyzeSeatAgainstDisplay(display, seat, []).overall);
    expect(cell.score).toBeGreaterThanOrEqual(0);
  });

  it('masks table footprints on the coverage field', () => {
    const room = { ...createDefaultRoom('conference'), width: 8, depth: 7, openings: [], columns: [] };
    const tables = [{ id: 'conference-table', centerX: 0, centerZ: 0.5, sizeX: 1.2, sizeZ: 3 }];
    const grid = sampleDisplayCoverage(room, display, [], 'standard', 'overall', tables, []);
    const under = grid.cells.find((c) => Math.abs(c.x) < 0.3 && Math.abs(c.z - 0.5) < 0.4);
    expect(under?.masked).toBe(true);
  });

  it('invalidates when the display moves', () => {
    const room = { ...createDefaultRoom('conference'), width: 10, depth: 8, openings: [], columns: [] };
    const a = cachedCoverage(room, display, [], 'standard');
    const moved = { ...display, position: { ...display.position, x: 2 } };
    const b = cachedCoverage(room, moved, [], 'standard');
    expect(a.grid.cells.map((c) => c.overall).join('')).not.toBe(b.grid.cells.map((c) => c.overall).join(''));
  });
});

describe('Camera FOV orientation', () => {
  it('uses the camera facing, not a static triangle', () => {
    const cam: CameraPlacement = { id: 'c1', x: 0, y: 2.4, z: -4, facingRad: 0, horizontalFovDeg: 70 };
    expect(withinHorizontalFov(cam, 0, 0)).toBe(true);
    const turned: CameraPlacement = { ...cam, facingRad: Math.PI };
    expect(withinHorizontalFov(turned, 0, 0)).toBe(false);
  });
});

describe('Validation consumes display analysis', () => {
  it('VIEW findings use the same overall as analyzeSeatAgainstDisplay', () => {
    const room = { ...createDefaultRoom('conference'), width: 10, depth: 8, openings: [], columns: [] };
    const product: EquipmentProduct = {
      id: 'd86',
      manufacturer: 'Acme',
      model: '86',
      category: 'display',
      type: 'display',
      physical: { width: 1.9, height: 1.07, depth: 0.08 },
      display: { diagonalInches: 86, resolution: '4K', aspectRatio: '16:9', brightnessNits: 500 },
      mounting: { wall: true, floor: false, ceiling: false },
      provenance: 'estimated'
    };
    const catalog = new EquipmentCatalog();
    catalog.register([product]);
    const inst: EquipmentInstance = {
      instanceId: 'disp-1',
      productId: 'd86',
      name: 'Display',
      position: display.position,
      rotationY: 0,
      wall: 'front'
    };
    const seats = [{ id: 'S1', row: 1, indexInRow: 1, x: 0, z: 2, facing: 0, hasTable: true }];
    const report = runDesignValidation({ room, seats, tables: [], equipment: [inst], catalog });
    const analysis = analyzeSeatAgainstDisplay(display, seats[0], projectObstacles(room, []));
    const viewOverall = report.findings.filter((f) => f.code.startsWith('VIEW-') && f.affectedObjects.some((o) => o.id === 'S1'));
    expect(viewOverall.length).toBeGreaterThan(0);
    if (analysis.overall === 'pass') {
      expect(viewOverall.every((f) => f.severity === 'pass' || f.severity === 'info')).toBe(true);
    }
    expect(defaultFloorRack().ruTotal).toBe(42);
  });
});
