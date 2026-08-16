/**
 * DisplayCoverageEngine.ts
 * Samples the room floor and runs the SAME viewing analysis used for
 * seats. This is coverage-of-viewing-quality, not a decorative FOV cone.
 */

import type { RoomModel } from '../room/RoomModel';
import type { CheckStatus, DisplayPlacement, SeatDisplayAnalysis } from './ViewingDistanceEngine';
import { analyzeSeat } from './ViewingDistanceEngine';
import type { Obstacle } from './SightlineEngine';
import { applyObstruction } from './SightlineEngine';
import { DEFAULT_CONTENT_TYPE, DEFAULT_EYE_HEIGHT_M } from './DesignAnalysis';
import { sampleFloorGrid, type SamplingQuality } from './simulation/FloorGrid';

export type { SamplingQuality } from './simulation/FloorGrid';

export interface CoverageCell {
  col: number;
  row: number;
  x: number;
  z: number;
  overall: CheckStatus;
  analysis: SeatDisplayAnalysis;
}

export interface CoverageGrid {
  cols: number;
  rows: number;
  spacingM: number;
  cells: CoverageCell[];
  passCount: number;
  warningCount: number;
  failCount: number;
  method: string;
}

export function sampleDisplayCoverage(
  room: RoomModel,
  display: DisplayPlacement,
  obstacles: Obstacle[] = [],
  quality: SamplingQuality = 'standard'
): CoverageGrid {
  const sampled = sampleFloorGrid(room, quality, (point) => {
    const viewer = { seatId: `cell-${point.col}-${point.row}`, x: point.x, z: point.z, eyeHeightM: DEFAULT_EYE_HEIGHT_M };
    let analysis = analyzeSeat(display, viewer, DEFAULT_CONTENT_TYPE);
    analysis = applyObstruction(analysis, display, viewer, obstacles);
    return {
      col: point.col,
      row: point.row,
      x: point.x,
      z: point.z,
      overall: analysis.overall,
      analysis
    };
  });

  return {
    ...sampled,
    method: `Uniform ${sampled.spacingM}m floor grid; each cell evaluated with the same viewing-distance / angle / visibility / obstruction model as seats (image-height heuristic, not licensed AVIXA DISCAS).`
  };
}

export function cellAt(grid: CoverageGrid, x: number, z: number): CoverageCell | undefined {
  let best: CoverageCell | undefined;
  let bestD = Infinity;
  for (const cell of grid.cells) {
    const d = (cell.x - x) ** 2 + (cell.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = cell;
    }
  }
  return best;
}
