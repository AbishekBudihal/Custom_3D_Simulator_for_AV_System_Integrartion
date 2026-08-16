/**
 * coverageCache.ts
 * Memoizes display coverage grids so 3D/plan/heatmap do not resample
 * the room every animation frame or every identical notify.
 */

import type { RoomModel } from '../room/RoomModel';
import type { DisplayPlacement } from './ViewingDistanceEngine';
import type { Obstacle } from './SightlineEngine';
import { sampleDisplayCoverage, type CoverageGrid, type SamplingQuality } from './DisplayCoverageEngine';
import type { HeatmapImage } from './HeatmapEngine';
import { createCoverageMemo } from './simulation/CoverageMemo';

const memo = createCoverageMemo<CoverageGrid>();

export function cachedCoverage(
  room: RoomModel,
  display: DisplayPlacement,
  obstacles: Obstacle[],
  quality: SamplingQuality
): { grid: CoverageGrid; image: HeatmapImage } {
  const key = JSON.stringify({
    layer: 'display',
    w: room.width,
    d: room.depth,
    quality,
    display,
    obstacles
  });
  return memo.get(key, () => sampleDisplayCoverage(room, display, obstacles, quality));
}
