/**
 * HeatmapEngine.ts
 * Reusable analysis visualization: status/score → color.
 * Does not invent values — it only maps CheckStatus (or a 0..1 score
 * derived from status) to a color. Canvas encoding is optional and
 * skipped in non-DOM test environments.
 */

import type { CheckStatus } from './ViewingDistanceEngine';

export type HeatmapCell = {
  col: number;
  row: number;
  overall: CheckStatus;
  score?: number;
  masked?: boolean;
  x?: number;
  z?: number;
};

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

/** Continuous legend colors: fail → warning → pass. */
export function colorForScore(score: number, alpha = 150): [number, number, number, number] {
  const t = Math.min(1, Math.max(0, score));
  const [r0, g0, b0] = STATUS_RGB.fail;
  const [r1, g1, b1] = STATUS_RGB.warning;
  const [r2, g2, b2] = STATUS_RGB.pass;
  if (t <= 0.5) {
    const u = t / 0.5;
    return [
      Math.round(r0 + (r1 - r0) * u),
      Math.round(g0 + (g1 - g0) * u),
      Math.round(b0 + (b1 - b0) * u),
      alpha
    ];
  }
  const u = (t - 0.5) / 0.5;
  return [
    Math.round(r1 + (r2 - r1) * u),
    Math.round(g1 + (g2 - g1) * u),
    Math.round(b1 + (b2 - b1) * u),
    alpha
  ];
}

export function colorForStatus(status: CheckStatus, alpha = 180): [number, number, number, number] {
  return colorForScore(statusScore(status), alpha);
}

export interface HeatmapImage {
  width: number;
  height: number;
  dataUrl: string | null;
}

/**
 * Rasterize a coverage grid into a top-down image. Cell (0,0) is the
 * room's -X/-Z corner so the texture maps onto a plane whose local
 * origin is room center. Values are bilinearly upsampled so the overlay
 * is a continuous field, not nearest-neighbor tiles.
 */
export function rasterizeCoverageGrid(
  cells: HeatmapCell[],
  cols: number,
  rows: number,
  alpha = 150,
  upsample = 8
): HeatmapImage {
  if (typeof document === 'undefined' || cells.length === 0) {
    return { width: cols, height: rows, dataUrl: null };
  }
  const scores = new Float32Array(cols * rows);
  const mask = new Uint8Array(cols * rows);
  cells.forEach((cell) => {
    const i = cell.row * cols + cell.col;
    if (i < 0 || i >= scores.length) return;
    if (cell.masked) {
      mask[i] = 0;
      scores[i] = 0;
      return;
    }
    mask[i] = 1;
    scores[i] = cell.score ?? statusScore(cell.overall);
  });
  const scale = Math.max(1, Math.min(12, Math.round(upsample)));
  const width = cols * scale;
  const height = rows * scale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: cols, height: rows, dataUrl: null };
  const img = ctx.createImageData(width, height);
  const sample = (u: number, v: number): { s: number; m: number } => {
    const c0 = Math.floor(u);
    const r0 = Math.floor(v);
    const c1 = Math.min(cols - 1, c0 + 1);
    const r1 = Math.min(rows - 1, r0 + 1);
    const tx = u - c0;
    const ty = v - r0;
    const at = (c: number, r: number) => {
      const i = r * cols + c;
      return { s: scores[i], m: mask[i] };
    };
    const a = at(Math.max(0, c0), Math.max(0, r0));
    const b = at(c1, Math.max(0, r0));
    const c = at(Math.max(0, c0), r1);
    const d = at(c1, r1);
    const w00 = (1 - tx) * (1 - ty) * a.m;
    const w10 = tx * (1 - ty) * b.m;
    const w01 = (1 - tx) * ty * c.m;
    const w11 = tx * ty * d.m;
    const w = w00 + w10 + w01 + w11;
    if (w < 1e-6) return { s: 0, m: 0 };
    return { s: (a.s * w00 + b.s * w10 + c.s * w01 + d.s * w11) / w, m: 1 };
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / scale - 0.5;
      const v = (y + 0.5) / scale - 0.5;
      const { s, m } = sample(u, v);
      const i = (y * width + x) * 4;
      const [r, g, b, a] = colorForScore(s, m ? alpha : 0);
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { width, height, dataUrl: canvas.toDataURL('image/png') };
}
