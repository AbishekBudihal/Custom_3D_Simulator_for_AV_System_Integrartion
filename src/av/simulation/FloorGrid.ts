/**
 * FloorGrid.ts
 * Shared floor sampling for display / microphone / (future) speaker / camera
 * coverage heatmaps. Domain engines supply the per-cell evaluation.
 */

import type { CheckStatus } from '../ViewingDistanceEngine';

export type SamplingQuality = 'standard' | 'high';

export const FLOOR_SPACING_M: Record<SamplingQuality, number> = {
  standard: 0.5,
  high: 0.25
};

export interface FloorSamplePoint {
  col: number;
  row: number;
  x: number;
  z: number;
}

export interface FloorGridLayout {
  cols: number;
  rows: number;
  spacingM: number;
  points: FloorSamplePoint[];
}

export function layoutFloorGrid(
  room: { width: number; depth: number },
  quality: SamplingQuality = 'standard'
): FloorGridLayout {
  const spacingM = FLOOR_SPACING_M[quality];
  const cols = Math.max(2, Math.round(room.width / spacingM));
  const rows = Math.max(2, Math.round(room.depth / spacingM));
  const points: FloorSamplePoint[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      points.push({
        col,
        row,
        x: -room.width / 2 + (col + 0.5) * (room.width / cols),
        z: -room.depth / 2 + (row + 0.5) * (room.depth / rows)
      });
    }
  }
  return { cols, rows, spacingM, points };
}

export interface SampledFloorGrid<T extends { overall: CheckStatus }> {
  cols: number;
  rows: number;
  spacingM: number;
  cells: T[];
  passCount: number;
  warningCount: number;
  failCount: number;
}

export function sampleFloorGrid<T extends { overall: CheckStatus }>(
  room: { width: number; depth: number },
  quality: SamplingQuality,
  evaluate: (point: FloorSamplePoint) => T
): SampledFloorGrid<T> {
  const layout = layoutFloorGrid(room, quality);
  const cells: T[] = [];
  let passCount = 0;
  let warningCount = 0;
  let failCount = 0;
  layout.points.forEach((point) => {
    const cell = evaluate(point);
    cells.push(cell);
    if (cell.overall === 'pass') passCount++;
    else if (cell.overall === 'warning') warningCount++;
    else failCount++;
  });
  return {
    cols: layout.cols,
    rows: layout.rows,
    spacingM: layout.spacingM,
    cells,
    passCount,
    warningCount,
    failCount
  };
}
