import { describe, it, expect } from 'vitest';
import {
  calculateDistance,
  calculateHorizontalViewingAngle,
  calculateVerticalViewingAngle,
  analyzeAllSeats,
  type DisplayPlacement,
  type ViewerPoint
} from '../../src/av/ViewingDistanceEngine';

const display: DisplayPlacement = {
  diagonalInches: 86,
  aspectRatio: '16:9',
  widthM: 1.9,
  heightM: 1.1,
  position: { x: 0, y: 1.65, z: -3.5 },
  wall: 'front'
};

describe('ViewingDistanceEngine', () => {
  it('calculates on-axis distance correctly', () => {
    const viewer: ViewerPoint = { seatId: 'R1-S1', x: 0, z: 2, eyeHeightM: 1.1 };
    const result = calculateDistance(display, viewer);
    expect(result.value).toBeCloseTo(5.5, 1);
    expect(result.status).toBe('pass');
  });

  it('reports 0deg horizontal angle for a dead-center on-axis seat', () => {
    const viewer: ViewerPoint = { seatId: 'CENTER', x: 0, z: 2, eyeHeightM: 1.1 };
    const result = calculateHorizontalViewingAngle(display, viewer);
    expect(result.value).toBeCloseTo(0, 0);
    expect(result.status).toBe('pass');
  });

  it('flags a seat far off-axis as warning or fail', () => {
    const viewer: ViewerPoint = { seatId: 'FAR-SIDE', x: 6, z: -3.2, eyeHeightM: 1.1 };
    const result = calculateHorizontalViewingAngle(display, viewer);
    expect(['warning', 'fail']).toContain(result.status);
  });

  it('computes vertical angle within pass range for a typical seated viewer at moderate distance', () => {
    const viewer: ViewerPoint = { seatId: 'MID', x: 0, z: 3, eyeHeightM: 1.1 };
    const result = calculateVerticalViewingAngle(display, viewer);
    expect(result.status).toBe('pass');
  });

  it('produces an overall status per seat across all three checks', () => {
    const viewers: ViewerPoint[] = [
      { seatId: 'A', x: 0, z: 2, eyeHeightM: 1.1 },
      { seatId: 'B', x: 5, z: -3, eyeHeightM: 1.1 }
    ];
    const analysis = analyzeAllSeats(display, viewers, 'full_motion_video');
    expect(analysis).toHaveLength(2);
    analysis.forEach((a) => {
      expect(['pass', 'warning', 'fail']).toContain(a.overall);
    });
  });
});
