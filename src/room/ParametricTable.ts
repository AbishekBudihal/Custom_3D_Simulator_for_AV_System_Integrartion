/**
 * Parametric table dimensions and seating capacity.
 * Changing TableSpec size/shape drives chair positions — the mesh is not
 * scaled independently of the seating model.
 */

import { seatsAroundConferenceTable } from './ConferenceLayout';
import { conferenceTemplateId, conferenceWidthForCapacity, furnitureTemplate, type FurnitureShape } from './FurnitureCatalog';
import { aabbsOverlap, chairAabb, tableAabb } from './FurnitureGeometry';
import type { Seat, TableSpec } from './SeatingGenerator';

export const TABLE_WIDTH_MIN_M = 0.5;
export const TABLE_WIDTH_MAX_M = 6;
export const TABLE_HEIGHT_MIN_M = 0.65;
export const TABLE_HEIGHT_MAX_M = 0.9;
export const DEFAULT_SEAT_SPACING_M = 0.65;

export type TablePresetId =
  | 'small_conference'
  | 'standard_conference'
  | 'large_conference'
  | 'training'
  | 'classroom'
  | 'custom';

export interface TablePreset {
  id: TablePresetId;
  label: string;
  sizeX: number;
  sizeZ: number;
  height: number;
  shape: FurnitureShape;
  furnitureId: string;
  typicalSeats: number;
}

/** Typical conference / training furniture — not manufacturer SKUs. */
export const TABLE_PRESETS: TablePreset[] = [
  {
    id: 'small_conference',
    label: 'Small Conference',
    sizeX: 0.9,
    sizeZ: 1.6,
    height: 0.73,
    shape: 'rounded_rect',
    furnitureId: 'generic-small-meeting',
    typicalSeats: 4
  },
  {
    id: 'standard_conference',
    label: 'Standard Conference',
    sizeX: 1.2,
    sizeZ: 2.4,
    height: 0.73,
    shape: 'rounded_rect',
    furnitureId: 'generic-conference',
    typicalSeats: 8
  },
  {
    id: 'large_conference',
    label: 'Large Conference',
    sizeX: 1.4,
    sizeZ: 3.6,
    height: 0.73,
    shape: 'rounded_rect',
    furnitureId: 'generic-boardroom',
    typicalSeats: 12
  },
  {
    id: 'training',
    label: 'Training Table',
    sizeX: 1.2,
    sizeZ: 0.55,
    height: 0.73,
    shape: 'rect',
    furnitureId: 'generic-training-desk',
    typicalSeats: 2
  },
  {
    id: 'classroom',
    label: 'Classroom Table',
    sizeX: 0.7,
    sizeZ: 0.55,
    height: 0.73,
    shape: 'rect',
    furnitureId: 'generic-training-desk',
    typicalSeats: 1
  },
  {
    id: 'custom',
    label: 'Custom',
    sizeX: 1.2,
    sizeZ: 2.0,
    height: 0.75,
    shape: 'rounded_rect',
    furnitureId: 'generic-conference',
    typicalSeats: 6
  }
];

export function tablePreset(id: TablePresetId): TablePreset {
  return TABLE_PRESETS.find((p) => p.id === id) ?? TABLE_PRESETS[5];
}

export function clampTableDimension(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Number(Math.min(max, Math.max(min, value)).toFixed(3));
}

export function clampTableSpecSizes(patch: { sizeX?: number; sizeZ?: number; height?: number }): {
  sizeX?: number;
  sizeZ?: number;
  height?: number;
} {
  const out: { sizeX?: number; sizeZ?: number; height?: number } = {};
  if (patch.sizeX != null) out.sizeX = clampTableDimension(patch.sizeX, TABLE_WIDTH_MIN_M, TABLE_WIDTH_MAX_M);
  if (patch.sizeZ != null) out.sizeZ = clampTableDimension(patch.sizeZ, TABLE_WIDTH_MIN_M, TABLE_WIDTH_MAX_M);
  if (patch.height != null) out.height = clampTableDimension(patch.height, TABLE_HEIGHT_MIN_M, TABLE_HEIGHT_MAX_M);
  return out;
}

export function matchTablePreset(table: TableSpec): TablePresetId {
  const hit = TABLE_PRESETS.find(
    (p) =>
      p.id !== 'custom' &&
      Math.abs(p.sizeX - table.sizeX) < 0.04 &&
      Math.abs(p.sizeZ - table.sizeZ) < 0.04 &&
      Math.abs((table.height ?? 0.73) - p.height) < 0.03
  );
  return hit?.id ?? 'custom';
}

export function applyPresetToTable(table: TableSpec, presetId: TablePresetId): TableSpec {
  const p = tablePreset(presetId);
  if (presetId === 'custom') {
    return { ...table, presetId: 'custom' };
  }
  return {
    ...table,
    sizeX: p.sizeX,
    sizeZ: p.sizeZ,
    height: p.height,
    shape: p.shape,
    furnitureId: p.furnitureId,
    hasCableWell: p.furnitureId !== 'generic-training-desk',
    presetId
  };
}

export type TableSeatingMode = 'perimeter' | 'edge';

export function tableSeatingMode(table: TableSpec): TableSeatingMode {
  const cat = furnitureTemplate(table.furnitureId ?? 'generic-conference').category;
  if (cat === 'training' || cat === 'u_segment' || cat === 'square_segment') return 'edge';
  return 'perimeter';
}

export function seatSpacingFor(table: TableSpec): number {
  return furnitureTemplate(table.furnitureId ?? 'generic-conference').recommendedSeatSpacing;
}

/**
 * Practical occupant count from usable edge length and spacing.
 * Does not invent a seat-count → metres lookup.
 */
export function practicalSeatCapacity(table: TableSpec, spacing = seatSpacingFor(table)): number {
  const gap = Math.max(0.55, spacing);
  if (tableSeatingMode(table) === 'edge') {
    const along = Math.max(table.sizeX, table.sizeZ);
    return Math.max(1, Math.floor((along + 1e-6) / gap));
  }
  const long = Math.max(table.sizeX, table.sizeZ);
  const short = Math.min(table.sizeX, table.sizeZ);
  const perLong = Math.max(1, Math.floor((long - 0.28) / gap + 1e-6));
  const ends = short >= 1.15 ? 2 : short >= 0.75 ? 1 : 0;
  return perLong * 2 + ends * 2;
}

/** Occupancy-driven conference envelope. Length follows spacing, not a fixed seat-count rule. */
export function conferenceTableDimensions(
  capacity: number,
  seatWidth: number
): { sizeX: number; sizeZ: number; furnitureId: string } {
  const n = Math.max(1, Math.round(capacity));
  const spacing = Math.max(0.6, seatWidth);
  const furnitureId = conferenceTemplateId(n);
  const sizeX = conferenceWidthForCapacity(n);
  const dist = perimeterDistribute(n, sizeX);
  const perLong = Math.max(dist.left, dist.right, 1);
  const sizeZ = Number((perLong * spacing + 0.28).toFixed(3));
  return { sizeX, sizeZ, furnitureId };
}

function perimeterDistribute(n: number, w: number): { left: number; right: number; front: number; back: number } {
  const maxEnds = w >= 1.15 ? 2 : w >= 0.75 ? 1 : 0;
  let front = 0;
  let back = 0;
  if (n >= 6 && maxEnds >= 1) {
    front = 1;
    back = 1;
  }
  if (n >= 10 && maxEnds >= 2) {
    front = 2;
    back = 2;
  }
  if (n === 4 && maxEnds >= 1) {
    front = 1;
    back = 1;
  }
  if (front + back > n) {
    front = 0;
    back = 0;
  }
  const remaining = n - front - back;
  const left = Math.ceil(remaining / 2);
  return { left, right: remaining - left, front, back };
}

export function trainingTableDimensions(seatsAtTable: number, _seatWidth = DEFAULT_SEAT_SPACING_M): { sizeX: number; sizeZ: number } {
  const preset = tablePreset(seatsAtTable <= 1 ? 'classroom' : 'training');
  return { sizeX: preset.sizeX, sizeZ: preset.sizeZ };
}

export function seatsOwnedByTable(table: TableSpec, seats: Seat[], tableCount: number): Seat[] {
  const tagged = seats.filter((s) => s.tableId === table.id);
  if (tagged.length) return tagged;
  if (tableCount === 1) return seats;
  return [];
}

type EdgeSide = 'posZ' | 'negZ' | 'posX' | 'negX';

function inferEdgeSide(table: TableSpec, existing: Seat[]): EdgeSide {
  if (!existing.length) {
    return table.sizeX >= table.sizeZ ? 'posZ' : 'posX';
  }
  const ax = existing.reduce((s, x) => s + x.x, 0) / existing.length - table.centerX;
  const az = existing.reduce((s, x) => s + x.z, 0) / existing.length - table.centerZ;
  if (Math.abs(az) >= Math.abs(ax)) return az >= 0 ? 'posZ' : 'negZ';
  return ax >= 0 ? 'posX' : 'negX';
}

export function seatsAlongTableEdge(table: TableSpec, count: number, existing: Seat[] = []): Seat[] {
  const n = Math.max(0, Math.round(count));
  if (n === 0) return [];
  const tmpl = furnitureTemplate(table.furnitureId ?? 'generic-training-desk');
  const offset = tmpl.chairFromEdge;
  const side = inferEdgeSide(table, existing);
  const seats: Seat[] = [];
  const alongX = side === 'posZ' || side === 'negZ';
  const span = alongX ? table.sizeX : table.sizeZ;
  const spacing = n === 1 ? 0 : span / n;
  const start = -(span / 2) + spacing / 2;

  for (let i = 0; i < n; i++) {
    const along = start + i * spacing;
    let x = table.centerX;
    let z = table.centerZ;
    let facing = 0;
    if (side === 'posZ') {
      x = table.centerX + along;
      z = table.centerZ + table.sizeZ / 2 + offset;
      facing = 0;
    } else if (side === 'negZ') {
      x = table.centerX + along;
      z = table.centerZ - table.sizeZ / 2 - offset;
      facing = Math.PI;
    } else if (side === 'posX') {
      x = table.centerX + table.sizeX / 2 + offset;
      z = table.centerZ + along;
      facing = Math.PI / 2;
    } else {
      x = table.centerX - table.sizeX / 2 - offset;
      z = table.centerZ + along;
      facing = -Math.PI / 2;
    }
    seats.push({
      id: `${table.id}-S${i + 1}`,
      row: 1,
      indexInRow: i + 1,
      x: Number(x.toFixed(3)),
      z: Number(z.toFixed(3)),
      facing,
      hasTable: true,
      tableId: table.id,
      zoneId: table.zoneId
    });
  }
  return seats;
}

export interface TableRelayoutResult {
  seats: Seat[];
  placed: number;
  practical: number;
  requested: number;
  warning?: string;
}

export function relayoutSeatsForTable(
  table: TableSpec,
  allSeats: Seat[],
  allTables: TableSpec[],
  requested?: number
): TableRelayoutResult {
  const owned = seatsOwnedByTable(table, allSeats, allTables.length);
  const want = Math.max(0, Math.round(requested ?? owned.length));
  const practical = practicalSeatCapacity(table);
  const placed = Math.min(want, practical);
  const generated =
    tableSeatingMode(table) === 'edge'
      ? seatsAlongTableEdge(table, placed, owned)
      : seatsAroundConferenceTable(table, placed, seatSpacingFor(table));

  const remapped = generated.map((s, i) => ({
    ...s,
    id: owned[i]?.id ?? s.id,
    zoneId: owned[i]?.zoneId ?? table.zoneId,
    tableId: table.id
  }));

  const others = allSeats.filter((s) => !owned.some((o) => o.id === s.id) && s.tableId !== table.id);
  const merged = [...others, ...remapped];

  let warning: string | undefined;
  if (want > practical) {
    warning = `This table supports about ${practical} occupant(s) at ${seatSpacingFor(table).toFixed(2)} m spacing. Requested ${want}. Increase table dimensions or add another table.`;
  }

  const overlapOther = remapped.some((s) =>
    allTables.some((t) => t.id !== table.id && aabbsOverlap(chairAabb(s), tableAabb(t), 0.04))
  );
  if (overlapOther) {
    warning = [warning, 'Resized seating collides with another table.'].filter(Boolean).join(' ');
  }

  return { seats: merged, placed, practical, requested: want, warning };
}

export function translateSeatsForTable(tableId: string, seats: Seat[], dx: number, dz: number): Seat[] {
  if (dx === 0 && dz === 0) return seats;
  return seats.map((s) => (s.tableId === tableId ? { ...s, x: s.x + dx, z: s.z + dz } : s));
}
