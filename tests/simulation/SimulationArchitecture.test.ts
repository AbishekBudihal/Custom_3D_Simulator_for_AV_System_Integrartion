import { describe, it, expect } from 'vitest';
import { layoutFloorGrid, sampleFloorGrid } from '../../src/av/simulation/FloorGrid';
import { overlayLayerForFinding, layerHasImplementedOverlays } from '../../src/av/simulation/AnalysisLayer';

describe('FloorGrid', () => {
  it('uses the same cell centers for a given room and quality', () => {
    const a = layoutFloorGrid({ width: 10, depth: 7 }, 'standard');
    const b = layoutFloorGrid({ width: 10, depth: 7 }, 'standard');
    expect(a.points).toEqual(b.points);
    expect(a.spacingM).toBe(0.5);
  });

  it('lets domain engines supply per-cell status without owning the grid loop', () => {
    const sampled = sampleFloorGrid({ width: 4, depth: 4 }, 'standard', (p) => ({
      overall: Math.hypot(p.x, p.z) < 1 ? ('pass' as const) : ('fail' as const)
    }));
    expect(sampled.passCount + sampled.failCount).toBe(sampled.cells.length);
    expect(sampled.cells.length).toBe(sampled.cols * sampled.rows);
  });
});

describe('AnalysisLayer', () => {
  it('maps finding codes to overlay layers without string-prefix forks in UI', () => {
    expect(overlayLayerForFinding('VIEW-001')).toBe('display');
    expect(overlayLayerForFinding('DISPLAY-002')).toBe('display');
    expect(overlayLayerForFinding('SEAT-001')).toBe('display');
    expect(overlayLayerForFinding('MIC-001')).toBe('microphone');
    expect(overlayLayerForFinding('AUDIO-001')).toBe('audio');
    expect(overlayLayerForFinding('CAM-001')).toBe('camera');
    expect(overlayLayerForFinding('SIGNAL-001')).toBe('system');
    expect(overlayLayerForFinding('SYSTEM-004')).toBe('system');
    expect(layerHasImplementedOverlays('audio')).toBe(true);
    expect(layerHasImplementedOverlays('microphone')).toBe(true);
    expect(layerHasImplementedOverlays('camera')).toBe(true);
  });
});
