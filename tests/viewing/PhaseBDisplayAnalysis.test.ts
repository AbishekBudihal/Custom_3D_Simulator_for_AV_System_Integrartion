import { describe, it, expect } from 'vitest';
import {
  calculateDistance,
  calculateHorizontalViewingAngle,
  calculateVerticalViewingAngle,
  calculateVisibility,
  displayFaceNormal,
  analyzeSeat,
  type DisplayPlacement,
  type ViewerPoint
} from '../../src/av/ViewingDistanceEngine';
import { evaluateSightline, applyObstruction } from '../../src/av/SightlineEngine';
import { sampleDisplayCoverage, cellAt } from '../../src/av/DisplayCoverageEngine';
import { statusScore } from '../../src/av/HeatmapEngine';
import { computeViewerPose } from '../../src/av/ViewerPose';
import { computeSeatStatuses, summarizeDesignHealth, viewingHealthFromSummary } from '../../src/av/DesignAnalysis';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { presentationRotation } from '../../src/room/RoomGeometry';
import type { Seat } from '../../src/room/SeatingGenerator';

const frontDisplay: DisplayPlacement = {
  diagonalInches: 86,
  aspectRatio: '16:9',
  widthM: 1.9,
  heightM: 1.1,
  position: { x: 0, y: 1.65, z: -3.5 },
  wall: 'front',
  rotationY: 0
};

function viewer(id: string, x: number, z: number): ViewerPoint {
  return { seatId: id, x, z, eyeHeightM: 1.1 };
}

function seat(id: string, x: number, z: number): Seat {
  return { id, row: 1, indexInRow: 1, x, z, facing: 0, hasTable: false };
}

describe('Phase B — viewing geometry', () => {
  it('calculates planar viewer-to-display distance', () => {
    const r = calculateDistance(frontDisplay, viewer('A', 0, 2));
    expect(r.value).toBeCloseTo(5.5, 1);
    expect(r.provenance).toBe('calculated');
  });

  it('horizontal angle is ~0 on axis and fail far off-axis', () => {
    expect(calculateHorizontalViewingAngle(frontDisplay, viewer('C', 0, 2)).value).toBeCloseTo(0, 0);
    const off = calculateHorizontalViewingAngle(frontDisplay, viewer('S', 6, -3.2));
    expect(['warning', 'fail']).toContain(off.status);
  });

  it('vertical angle is pass for a typical seated viewer', () => {
    expect(calculateVerticalViewingAngle(frontDisplay, viewer('M', 0, 3)).status).toBe('pass');
  });

  it('overall seat status is PASS/WARNING/FAIL from real checks', () => {
    const a = analyzeSeat(frontDisplay, viewer('A', 0, 2), 'full_motion_video');
    expect(['pass', 'warning', 'fail']).toContain(a.overall);
    expect(a.visibility.value).toBe('visible');
  });
});

describe('Phase B — display orientation / side-wall', () => {
  it('face normal follows rotationY, not an assumed front wall', () => {
    const left: DisplayPlacement = {
      ...frontDisplay,
      position: { x: -5, y: 1.65, z: 0 },
      wall: 'left',
      rotationY: presentationRotation('left')
    };
    const n = displayFaceNormal(left);
    expect(n.x).toBeCloseTo(1, 5);
    expect(n.z).toBeCloseTo(0, 5);

    const onAxis = calculateHorizontalViewingAngle(left, viewer('L', 0, 0));
    expect(onAxis.value).toBeCloseTo(0, 0);
    expect(onAxis.status).toBe('pass');
  });

  it('a seat behind a side-wall display fails visibility', () => {
    const left: DisplayPlacement = {
      ...frontDisplay,
      position: { x: -5, y: 1.65, z: 0 },
      wall: 'left',
      rotationY: presentationRotation('left')
    };
    const vis = calculateVisibility(left, viewer('behind', -6, 0));
    expect(vis.value).toBe('behind_display');
    expect(vis.status).toBe('fail');
    expect(analyzeSeat(left, viewer('behind', -6, 0), 'full_motion_video').overall).toBe('fail');
  });
});

describe('Phase B — sightline / obstruction', () => {
  it('clear path when no obstacles', () => {
    const r = evaluateSightline(
      { seatId: 'A', x: 0, z: 2, eyeHeightM: 1.1 },
      { x: 0, z: -3.5, y: 1.65 },
      []
    );
    expect(r.value).toBe('clear');
    expect(r.status).toBe('pass');
  });

  it('tall column on the ray blocks the sightline and forces FAIL', () => {
    const display = frontDisplay;
    const v = viewer('A', 0, 2);
    const base = analyzeSeat(display, v, 'full_motion_video');
    const blocked = applyObstruction(base, display, v, [
      { id: 'column:0', x: 0, z: -0.5, topHeightM: 3, radius: 0.3 }
    ]);
    expect(blocked.sightline.value).toBe('blocked');
    expect(blocked.overall).toBe('fail');
  });
});

describe('Phase B — coverage / heatmap sampling', () => {
  it('samples the room and classifies each cell with the same engine as seats', () => {
    const room = { ...createDefaultRoom('conference'), width: 10, depth: 7, openings: [], columns: [] };
    const grid = sampleDisplayCoverage(room, frontDisplay, [], 'standard');
    expect(grid.cells.length).toBe(grid.cols * grid.rows);
    expect(grid.passCount + grid.warningCount + grid.failCount).toBe(grid.cells.length);

    const cell = cellAt(grid, 0, 2)!;
    const direct = analyzeSeat(frontDisplay, viewer('cell', cell.x, cell.z), 'full_motion_video');
    expect(cell.overall).toBe(direct.overall);
    expect(statusScore(cell.overall)).toBeGreaterThanOrEqual(0);
  });

  it('moving the display changes coverage classification', () => {
    const room = { ...createDefaultRoom('conference'), width: 10, depth: 7, openings: [], columns: [] };
    const a = sampleDisplayCoverage(room, frontDisplay, [], 'standard');
    const moved: DisplayPlacement = {
      ...frontDisplay,
      position: { x: 4, y: 1.65, z: -3.5 }
    };
    const b = sampleDisplayCoverage(room, moved, [], 'standard');
    const sig = (g: typeof a) => g.cells.map((c) => c.overall).join('');
    expect(sig(a)).not.toBe(sig(b));
  });
});

describe('Phase B — 3D/plan consistency and viewer pose', () => {
  it('computeSeatStatuses matches analyzeSeat overall for the same seats', () => {
    const seats = [seat('near', 0, -1), seat('mid', 0, 2)];
    const map = computeSeatStatuses(seats, frontDisplay, []);
    seats.forEach((s) => {
      const a = analyzeSeat(frontDisplay, viewer(s.id, s.x, s.z), 'full_motion_video');
      expect(map.get(s.id)).toBe(a.overall);
    });
  });

  it('viewer pose sits at eye height looking at the display, without mutating the seat', () => {
    const s = seat('R1', 0.5, 1.2);
    const before = { ...s };
    const pose = computeViewerPose(s, frontDisplay, 1.1);
    expect(pose.position.x).toBe(s.x);
    expect(pose.position.z).toBe(s.z);
    expect(pose.position.y).toBe(1.1);
    expect(pose.lookAt.x).toBe(frontDisplay.position.x);
    expect(pose.lookAt.z).toBe(frontDisplay.position.z);
    expect(s.x).toBe(before.x);
    expect(s.z).toBe(before.z);
  });

  it('viewing health uses counts, not an invented percentage', () => {
    const summary = summarizeDesignHealth([seat('a', 0, 2)], frontDisplay, []);
    const health = viewingHealthFromSummary(summary, true);
    expect(health.totalSeats).toBe(1);
    expect(health.passCount + health.warningCount + health.failCount).toBe(1);
    expect(health).not.toHaveProperty('percent');
  });
});
