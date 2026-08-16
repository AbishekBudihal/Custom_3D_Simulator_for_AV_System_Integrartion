/**
 * cameraCoverageCache.ts
 * Memoizes camera coverage grids. Not undo state.
 */

import type { RoomModel } from '../room/RoomModel';
import type { HeatmapImage } from './HeatmapEngine';
import type { Obstacle } from './SightlineEngine';
import { sampleCameraCoverage, type CameraCoverageGrid, type CameraPlacement } from './CameraCoverageEngine';
import { createCoverageMemo } from './simulation/CoverageMemo';

const memo = createCoverageMemo<CameraCoverageGrid>();

export function cachedCameraCoverage(
  room: RoomModel,
  cameras: CameraPlacement[],
  obstacles: Obstacle[],
  quality: 'standard' | 'high'
): { grid: CameraCoverageGrid; image: HeatmapImage } {
  const key = JSON.stringify({
    layer: 'camera',
    w: room.width,
    d: room.depth,
    quality,
    cameras,
    obstacles
  });
  return memo.get(key, () => sampleCameraCoverage(room, cameras, obstacles, quality));
}
