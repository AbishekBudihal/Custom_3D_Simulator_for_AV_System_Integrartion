/**
 * Continuous scalar field over a rectangular room floor grid.
 * Interpolation and contours are visualization of sampled engine values —
 * they do not invent a second coverage model.
 */

import type { CheckStatus } from '../ViewingDistanceEngine';
import { statusScore } from '../HeatmapEngine';
import { tableAabb } from '../../room/FurnitureGeometry';
import { rackFootprint, type AVRack } from '../AVRack';
import type { TableSpec } from '../../room/SeatingGenerator';

export interface ScalarField {
  cols: number;
  rows: number;
  roomWidth: number;
  roomDepth: number;
  /** Row-major, 0..1 quality/coverage. */
  values: Float32Array;
  /** 1 = analyze, 0 = outside room or furniture footprint. */
  mask: Uint8Array;
}

export interface FieldCell {
  col: number;
  row: number;
  x: number;
  z: number;
  overall: CheckStatus;
  score?: number;
  masked?: boolean;
}

export function cellWorld(roomWidth: number, roomDepth: number, cols: number, rows: number, col: number, row: number): { x: number; z: number } {
  return {
    x: -roomWidth / 2 + (col + 0.5) * (roomWidth / cols),
    z: -roomDepth / 2 + (row + 0.5) * (roomDepth / rows)
  };
}

export function pointInRoom(roomWidth: number, roomDepth: number, x: number, z: number, margin = 0): boolean {
  return (
    x >= -roomWidth / 2 + margin &&
    x <= roomWidth / 2 - margin &&
    z >= -roomDepth / 2 + margin &&
    z <= roomDepth / 2 - margin
  );
}

export function pointInFurniture(x: number, z: number, tables: TableSpec[] = [], racks: AVRack[] = []): boolean {
  if (tables.some((t) => {
    const b = tableAabb(t);
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  })) {
    return true;
  }
  return racks.some((r) => {
    const b = rackFootprint(r);
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  });
}

export function fieldFromCells(
  room: { width: number; depth: number },
  cols: number,
  rows: number,
  cells: FieldCell[],
  tables: TableSpec[] = [],
  racks: AVRack[] = []
): ScalarField {
  const values = new Float32Array(cols * rows);
  const mask = new Uint8Array(cols * rows);
  const byIndex = new Map<number, FieldCell>();
  cells.forEach((c) => byIndex.set(c.row * cols + c.col, c));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const cell = byIndex.get(i);
      const { x, z } = cell ?? cellWorld(room.width, room.depth, cols, rows, col, row);
      const furniture = cell?.masked || pointInFurniture(x, z, tables, racks);
      const inside = pointInRoom(room.width, room.depth, x, z);
      mask[i] = inside && !furniture ? 1 : 0;
      if (!mask[i]) {
        values[i] = 0;
        continue;
      }
      values[i] = cell?.score ?? statusScore(cell?.overall ?? 'fail');
    }
  }
  return { cols, rows, roomWidth: room.width, roomDepth: room.depth, values, mask };
}

/** Bilinear sample. Null if outside the room or in a masked (furniture) cell. */
export function sampleField(field: ScalarField, x: number, z: number): number | null {
  if (!pointInRoom(field.roomWidth, field.roomDepth, x, z)) return null;
  const u = (x + field.roomWidth / 2) / field.roomWidth * field.cols - 0.5;
  const v = (z + field.roomDepth / 2) / field.roomDepth * field.rows - 0.5;
  const c0 = Math.floor(u);
  const r0 = Math.floor(v);
  const c1 = c0 + 1;
  const r1 = r0 + 1;
  const tx = u - c0;
  const ty = v - r0;
  const at = (c: number, r: number): { value: number; mask: number } | null => {
    if (c < 0 || r < 0 || c >= field.cols || r >= field.rows) return null;
    const i = r * field.cols + c;
    return { value: field.values[i], mask: field.mask[i] };
  };
  const a = at(c0, r0);
  const b = at(c1, r0);
  const c = at(c0, r1);
  const d = at(c1, r1);
  if (!a || !b || !c || !d) {
    const nearest = at(Math.max(0, Math.min(field.cols - 1, Math.round(u))), Math.max(0, Math.min(field.rows - 1, Math.round(v))));
    if (!nearest || !nearest.mask) return null;
    return nearest.value;
  }
  if (!a.mask && !b.mask && !c.mask && !d.mask) return null;
  const w00 = (1 - tx) * (1 - ty) * a.mask;
  const w10 = tx * (1 - ty) * b.mask;
  const w01 = (1 - tx) * ty * c.mask;
  const w11 = tx * ty * d.mask;
  const w = w00 + w10 + w01 + w11;
  if (w < 1e-6) return null;
  return (a.value * w00 + b.value * w10 + c.value * w01 + d.value * w11) / w;
}

export interface ContourPolyline {
  iso: number;
  points: Array<{ x: number; z: number }>;
}

function lerpEdge(
  x0: number,
  z0: number,
  v0: number,
  x1: number,
  z1: number,
  v1: number,
  iso: number
): { x: number; z: number } {
  const t = Math.abs(v1 - v0) < 1e-9 ? 0.5 : (iso - v0) / (v1 - v0);
  const u = Math.min(1, Math.max(0, t));
  return { x: x0 + (x1 - x0) * u, z: z0 + (z1 - z0) * u };
}

/**
 * Marching-squares isolines. Segments are not joined into loops (fine for overlay).
 */
export function contourPolylines(field: ScalarField, isos: number[]): ContourPolyline[] {
  const out: ContourPolyline[] = [];
  const dx = field.roomWidth / field.cols;
  const dz = field.roomDepth / field.rows;
  const val = (c: number, r: number) => field.values[r * field.cols + c];
  const on = (c: number, r: number) => field.mask[r * field.cols + c] === 1;

  isos.forEach((iso) => {
    const points: Array<{ x: number; z: number }> = [];
    for (let r = 0; r < field.rows - 1; r++) {
      for (let c = 0; c < field.cols - 1; c++) {
        if (!on(c, r) || !on(c + 1, r) || !on(c, r + 1) || !on(c + 1, r + 1)) continue;
        const x0 = -field.roomWidth / 2 + (c + 0.5) * dx;
        const z0 = -field.roomDepth / 2 + (r + 0.5) * dz;
        const x1 = x0 + dx;
        const z1 = z0 + dz;
        const v00 = val(c, r);
        const v10 = val(c + 1, r);
        const v01 = val(c, r + 1);
        const v11 = val(c + 1, r + 1);
        const b =
          (v00 >= iso ? 1 : 0) |
          (v10 >= iso ? 2 : 0) |
          (v11 >= iso ? 4 : 0) |
          (v01 >= iso ? 8 : 0);
        if (b === 0 || b === 15) continue;
        const bottom = lerpEdge(x0, z0, v00, x1, z0, v10, iso);
        const right = lerpEdge(x1, z0, v10, x1, z1, v11, iso);
        const top = lerpEdge(x0, z1, v01, x1, z1, v11, iso);
        const left = lerpEdge(x0, z0, v00, x0, z1, v01, iso);
        const segs: Array<[{ x: number; z: number }, { x: number; z: number }]> = [];
        if (b === 1 || b === 14) segs.push([left, bottom]);
        else if (b === 2 || b === 13) segs.push([bottom, right]);
        else if (b === 4 || b === 11) segs.push([right, top]);
        else if (b === 8 || b === 7) segs.push([top, left]);
        else if (b === 3 || b === 12) segs.push([left, right]);
        else if (b === 6 || b === 9) segs.push([bottom, top]);
        else if (b === 5) segs.push([left, bottom], [right, top]);
        else if (b === 10) segs.push([bottom, right], [top, left]);
        segs.forEach(([p, q]) => {
          points.push(p, q);
        });
      }
    }
    if (points.length) out.push({ iso, points });
  });
  return out;
}

export function displayMetricScore(
  metric: 'overall' | 'distance' | 'angle' | 'sightline',
  analysis: {
    overall: CheckStatus;
    viewingDistance: { status: CheckStatus };
    horizontalAngle: { status: CheckStatus };
    verticalAngle: { status: CheckStatus };
    sightline: { status: CheckStatus };
    visibility: { status: CheckStatus };
  }
): number {
  if (metric === 'distance') return statusScore(analysis.viewingDistance.status);
  if (metric === 'angle') {
    return Math.min(statusScore(analysis.horizontalAngle.status), statusScore(analysis.verticalAngle.status));
  }
  if (metric === 'sightline') {
    return Math.min(statusScore(analysis.sightline.status), statusScore(analysis.visibility.status));
  }
  return statusScore(analysis.overall);
}
