/**
 * micCoverageCache.ts
 * Memoizes microphone disc coverage grids. Not undo state.
 */

import type { RoomModel } from '../room/RoomModel';
import type { HeatmapImage } from './HeatmapEngine';
import { sampleMicCoverage, type MicCoverageGrid, type MicPlacement } from './MicrophoneCoverageEngine';
import { createCoverageMemo } from './simulation/CoverageMemo';

const memo = createCoverageMemo<MicCoverageGrid>();

export function cachedMicCoverage(
  room: RoomModel,
  mics: MicPlacement[],
  quality: 'standard' | 'high'
): { grid: MicCoverageGrid; image: HeatmapImage } {
  const key = JSON.stringify({ layer: 'microphone', w: room.width, d: room.depth, quality, mics });
  return memo.get(key, () => sampleMicCoverage(room, mics, quality));
}
