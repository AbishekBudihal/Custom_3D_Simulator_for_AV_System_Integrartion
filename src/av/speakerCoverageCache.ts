/**
 * speakerCoverageCache.ts
 * Memoizes speaker coverage grids. Not undo state.
 */

import type { RoomModel } from '../room/RoomModel';
import type { HeatmapImage } from './HeatmapEngine';
import { sampleSpeakerCoverage, type SpeakerCoverageGrid, type SpeakerPlacement } from './SpeakerCoverageEngine';
import { createCoverageMemo } from './simulation/CoverageMemo';

const memo = createCoverageMemo<SpeakerCoverageGrid>();

export function cachedSpeakerCoverage(
  room: RoomModel,
  speakers: SpeakerPlacement[],
  quality: 'standard' | 'high'
): { grid: SpeakerCoverageGrid; image: HeatmapImage } {
  const key = JSON.stringify({ layer: 'audio', w: room.width, d: room.depth, h: room.height, quality, speakers });
  return memo.get(key, () => sampleSpeakerCoverage(room, speakers, quality));
}
