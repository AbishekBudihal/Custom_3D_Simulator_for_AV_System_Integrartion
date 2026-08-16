/**
 * HeatmapEngine.ts
 * Reusable analysis visualization: status/score → color.
 * Does not invent values — it only maps CheckStatus (or a 0..1 score
 * derived from status) to a color. Canvas encoding is optional and
 * skipped in non-DOM test environments.
 */

import type { CheckStatus } from './ViewingDistanceEngine';

export type HeatmapCell = { col: number; row: number; overall: CheckStatus };

export const STATUS_RGB: Record<CheckStatus, [number, number, number]> = {
  pass: [47, 174, 90],
  warning: [224, 169, 52],
  fail: [214, 72, 63]
};

export function statusScore(status: CheckStatus): number {
  if (status === 'pass') return 1;
  if (status === 'warning') return 0.5;
  return 0;
}

export function colorForStatus(status: CheckStatus, alpha = 180): [number, number, number, number] {
  const [r, g, b] = STATUS_RGB[status];
  return [r, g, b, alpha];
}

export interface HeatmapImage {
  width: number;
  height: number;
  dataUrl: string | null;
}

/**
 * Rasterize a coverage grid into a top-down image. Cell (0,0) is the
 * room's -X/-Z corner so the texture maps onto a plane whose local
 * origin is room center.
 */
export function rasterizeCoverageGrid(
  cells: HeatmapCell[],
  cols: number,
  rows: number,
  alpha = 150
): HeatmapImage {
  if (typeof document === 'undefined' || cells.length === 0) {
    return { width: cols, height: rows, dataUrl: null };
  }
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: cols, height: rows, dataUrl: null };
  const img = ctx.createImageData(cols, rows);
  cells.forEach((cell) => {
    const i = (cell.row * cols + cell.col) * 4;
    const [r, g, b, a] = colorForStatus(cell.overall, alpha);
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = a;
  });
  ctx.putImageData(img, 0, 0);
  return { width: cols, height: rows, dataUrl: canvas.toDataURL('image/png') };
}
