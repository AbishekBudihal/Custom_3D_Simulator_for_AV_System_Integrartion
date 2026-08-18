/**
 * SeatingGenerator.ts
 * Replaces the old "Single Seat / Row x6 / Row x10" placement
 * model. The engineer specifies a seating INTENT (layout type +
 * capacity + spacing rules); this module computes seat positions
 * algorithmically and returns pure data (Seat[]). Rendering
 * (instanced meshes) is separate so the engine stays testable
 * without Three.js.
 */

import type { RoomModel } from './RoomModel';
import type { FurnitureShape } from './FurnitureCatalog';
import { furnitureTemplate } from './FurnitureCatalog';
import { getPresentationWall, presentationRotation, rotatePoint, normalizeAngle } from './RoomGeometry';
import type { Aabb } from './FurnitureGeometry';
import { generateConferenceLayout } from './ConferenceLayout';
import { generateFlexibleLayout, generateIndependentTables } from './IndependentTableLayout';

export type SeatingLayout =
  | 'boardroom'
  | 'conference'
  | 'classroom'
  | 'training'
  | 'flexible'
  | 'custom'
  | 'theater'
  | 'u_shape'
  | 'hollow_square'
  | 'auditorium_tiered';

export interface SeatingConfig {
  layout: SeatingLayout;
  capacity: number;
  seatWidth: number;      // m, center-to-center seat spacing
  rowPitch: number;       // m, row-to-row spacing
  sideClearance: number;  // m, from side walls
  rearClearance: number;  // m, from rear wall
  frontClearance: number; // m, from front/display wall
  aisleWidth: number;     // m
  /** Optional keep-outs (rack service envelope, etc.). View of architectural exclusions is always applied. */
  exclusions?: Aabb[];
}

export interface Seat {
  id: string;             // e.g. "R2-S3"
  row: number;
  indexInRow: number;
  x: number;
  z: number;
  /**
   * Yaw in radians — direction the seat faces. 0 = facing -Z / the room's
   * canonical front (presentation) wall. This is the single orientation
   * convention for the whole app: use RoomGeometry.seatForward(facing) to
   * get the actual look direction, rather than re-deriving sin/cos signs
   * locally (that's what caused seats to render facing backward before).
   */
  facing: number;
  hasTable: boolean;
  /** Owning TableSpec id. Never infer a table by grouping chairs. */
  tableId?: string;
  zoneId?: string;
}

/**
 * A single piece of table furniture, in world space, axis-aligned
 * (sizeX/sizeZ are extents along the world axes — every layout here only
 * ever rotates in 90° steps, so a canonical-frame box stays axis-aligned
 * after the presentation-wall transform; sizeX/sizeZ just swap for a
 * left/right presentation wall).
 *
 * This is deliberately a real, generator-owned entity — not something the
 * renderer infers from seat positions. Inferring "table shape" from a
 * bounding box of whichever seats share a row index is what produced two
 * disconnected table strips hugging the boardroom's side walls instead of
 * one conference table in the middle: grouping by row happened to put all
 * the LEFT-column chairs in "row 1" and all the RIGHT-column chairs in
 * "row 2", so each got its own strip. A boardroom's table is one object;
 * a classroom's is one desk per row; that's a decision the LAYOUT makes,
 * not something to reverse-engineer from chair positions afterward.
 */
export interface TableSpec {
  id: string;
  centerX: number;
  centerZ: number;
  sizeX: number;
  sizeZ: number;
  /** Tabletop AFF. Default 0.73. */
  height?: number;
  /** Tabletop thickness. Default 0.04. */
  thickness?: number;
  shape?: FurnitureShape;
  furnitureId?: string;
  hasCableWell?: boolean;
  zoneId?: string;
  /** Last applied dimension preset, or custom after a manual size edit. */
  presetId?: string;
  /** Requested occupant count when it exceeds practical capacity (warning only). */
  requestedSeats?: number;
}

export interface SeatingGenerationResult {
  seats: Seat[];
  tables: TableSpec[];
  warnings: string[];
  valid: boolean;
  layoutReason: string;
}

export function defaultSeatingConfig(capacity: number, layout: SeatingLayout = 'classroom'): SeatingConfig {
  return {
    layout,
    capacity,
    seatWidth: 0.6,
    rowPitch: layout === 'boardroom' ? 0.9 : 1.05,
    sideClearance: 0.9,
    rearClearance: 0.9,
    frontClearance: 1.7,
    aisleWidth: 1.0
  };
}

/**
 * Generates seat positions for the given room + config.
 * Throws no errors on overflow — instead returns as many seats as
 * physically fit and reports the shortfall via `warnings` so the
 * UI can surface "room too small for requested capacity" honestly.
 *
 * All layout functions below are written in a CANONICAL frame where the
 * presentation wall is always the "front" wall (small z, seats default to
 * facing -Z toward it) — that's what keeps each layout function simple.
 * This wrapper is what makes that safe to assume: it reads the room's
 * actual presentation wall (RoomGeometry.getPresentationWall), generates
 * in the canonical frame, then rotates the result into world space. A
 * left/right presentation wall also swaps which room dimension is "along
 * the wall" vs. "away from it", since those walls run along Z instead of X.
 */
export function generateSeating(room: RoomModel, cfg: SeatingConfig): SeatingGenerationResult {
  const wall = getPresentationWall(room);
  const rot = presentationRotation(wall);
  const swapped = wall === 'left' || wall === 'right';
  const canonicalRoom: RoomModel = swapped ? { ...room, width: room.depth, depth: room.width } : room;

  const raw = generateByLayout(canonicalRoom, cfg);
  if (rot === 0) return raw;

  const seats = raw.seats.map((s) => {
    const p = rotatePoint(s.x, s.z, rot);
    return { ...s, x: Number(p.x.toFixed(3)), z: Number(p.z.toFixed(3)), facing: normalizeAngle(s.facing + rot) };
  });
  const tables = raw.tables.map((t) => {
    const p = rotatePoint(t.centerX, t.centerZ, rot);
    return {
      ...t,
      centerX: Number(p.x.toFixed(3)),
      centerZ: Number(p.z.toFixed(3)),
      sizeX: swapped ? t.sizeZ : t.sizeX,
      sizeZ: swapped ? t.sizeX : t.sizeZ
    };
  });
  return { seats, tables, warnings: raw.warnings, valid: raw.valid, layoutReason: raw.layoutReason };
}

function generateByLayout(room: RoomModel, cfg: SeatingConfig): SeatingGenerationResult {
  switch (cfg.layout) {
    case 'boardroom':
    case 'conference':
      return generateConferenceLayout(room, cfg);
    case 'classroom':
    case 'training':
      return generateIndependentTables(room, cfg, { seatsPerTable: 2 });
    case 'flexible':
    case 'custom':
      return generateFlexibleLayout(room, cfg);
    case 'theater':
    case 'auditorium_tiered':
      return generateTheater(room, cfg);
    case 'u_shape':
      return generateUShape(room, cfg);
    case 'hollow_square':
      return generateHollowSquare(room, cfg);
    default:
      return generateIndependentTables(room, cfg, { seatsPerTable: 2 });
  }
}

const CHAIR_BEHIND = 0.42;
const MIN_WALK = 0.55;

function makeTable(
  id: string,
  furnitureId: string,
  cx: number,
  cz: number,
  sizeX: number,
  sizeZ: number,
  extras: Partial<TableSpec> = {}
): TableSpec {
  const tmpl = furnitureTemplate(furnitureId);
  return {
    id,
    furnitureId,
    centerX: Number(cx.toFixed(3)),
    centerZ: Number(cz.toFixed(3)),
    sizeX: Number(sizeX.toFixed(3)),
    sizeZ: Number(sizeZ.toFixed(3)),
    height: tmpl.typicalHeight,
    thickness: tmpl.typicalThickness,
    shape: tmpl.shape,
    hasCableWell: tmpl.category === 'conference' || tmpl.category === 'boardroom',
    ...extras
  };
}

function generateTheater(room: RoomModel, cfg: SeatingConfig): SeatingGenerationResult {
  const seats: Seat[] = [];
  const warnings: string[] = [];
  const pitch = Math.max(0.9, cfg.rowPitch * 0.85);
  const usableW = room.width - 2 * cfg.sideClearance;
  const seatsPerRow = Math.max(1, Math.floor(usableW / cfg.seatWidth));
  const usableDepth = room.depth - cfg.frontClearance - cfg.rearClearance;
  const maxRows = Math.max(1, Math.floor(usableDepth / pitch) + 1);
  let placed = 0;
  let row = 0;
  while (placed < cfg.capacity && row < maxRows) {
    const inThisRow = Math.min(seatsPerRow, cfg.capacity - placed);
    const rowSpan = Math.max(cfg.seatWidth, (inThisRow - 1) * cfg.seatWidth);
    const startX = -rowSpan / 2;
    const seatZ = -room.depth / 2 + cfg.frontClearance + row * pitch;
    for (let s = 0; s < inThisRow; s++) {
      seats.push({
        id: `R${row + 1}-S${s + 1}`,
        row: row + 1,
        indexInRow: s + 1,
        x: startX + s * cfg.seatWidth,
        z: seatZ,
        facing: 0,
        hasTable: false
      });
      placed++;
    }
    row++;
  }
  if (placed < cfg.capacity) {
    warnings.push(`${cfg.capacity} seats cannot be accommodated with the selected room dimensions and required circulation. Placed ${placed}.`);
  }
  return {
    seats,
    tables: [],
    warnings,
    valid: placed === cfg.capacity,
    layoutReason: 'Theater: seats only, no tables.'
  };
}

function generateUShape(room: RoomModel, cfg: SeatingConfig): SeatingGenerationResult {
  const seats: Seat[] = [];
  const warnings: string[] = [];
  const tmpl = furnitureTemplate('generic-u-segment');
  const depth = tmpl.typicalWidth;
  const spacing = cfg.seatWidth;
  const walk = Math.max(MIN_WALK, cfg.sideClearance * 0.75);
  const inner = Math.min(2.6, Math.max(1.6, room.width * 0.32));
  const perSideWanted = Math.max(2, Math.ceil((cfg.capacity - 3) / 2));
  const maxSide = Math.max(1, Math.floor((room.depth - cfg.frontClearance - cfg.rearClearance - 0.6) / spacing));
  const perSide = Math.min(perSideWanted, maxSide);
  const perBack = Math.max(1, Math.min(Math.floor(inner / spacing) + 2, cfg.capacity));

  const tableHalfInner = inner / 2;
  const leftTableX = -tableHalfInner - depth / 2;
  const rightTableX = tableHalfInner + depth / 2;
  const startZ = -room.depth / 2 + cfg.frontClearance + 0.2;
  const legL = perSide * spacing;
  const backZ = startZ + legL - depth / 2;

  const leftSeats: Seat[] = [];
  const rightSeats: Seat[] = [];
  const backSeats: Seat[] = [];
  let placed = 0;

  for (let i = 0; i < perSide && placed < cfg.capacity; i++) {
    const z = startZ + i * spacing;
      const l: Seat = {
        id: `UL${i + 1}`,
        row: 1,
        indexInRow: i + 1,
        x: leftTableX - depth / 2 - tmpl.chairFromEdge,
        z,
        facing: -Math.PI / 2,
        hasTable: true,
        tableId: 'u-left'
      };
    seats.push(l);
    leftSeats.push(l);
    placed++;
    if (placed >= cfg.capacity) break;
      const r: Seat = {
        id: `UR${i + 1}`,
        row: 2,
        indexInRow: i + 1,
        x: rightTableX + depth / 2 + tmpl.chairFromEdge,
        z,
        facing: Math.PI / 2,
        hasTable: true,
        tableId: 'u-right'
      };
    seats.push(r);
    rightSeats.push(r);
    placed++;
  }
  const backCount = Math.min(perBack, cfg.capacity - placed);
  const backSpan = Math.max(spacing, (backCount - 1) * spacing);
  for (let i = 0; i < backCount; i++) {
    const x = -backSpan / 2 + i * spacing;
      const b: Seat = {
        id: `UB${i + 1}`,
        row: 3,
        indexInRow: i + 1,
        x,
        z: backZ + depth / 2 + tmpl.chairFromEdge,
        facing: 0,
        hasTable: true,
        tableId: 'u-back'
      };
    seats.push(b);
    backSeats.push(b);
    placed++;
  }

  if (placed < cfg.capacity) {
    warnings.push(`${cfg.capacity} seats cannot be accommodated in a U-shape with required circulation. Placed ${placed}.`);
  }

  const outer = Math.max(...seats.map((s) => Math.abs(s.x)), 0) + CHAIR_BEHIND;
  if (outer + walk > room.width / 2) {
    warnings.push('U-shape exceeds room width once circulation is included.');
  }

  const tables: TableSpec[] = [];
  if (leftSeats.length) {
    const zMid = (leftSeats[0].z + leftSeats[leftSeats.length - 1].z) / 2;
    tables.push(makeTable('u-left', 'generic-u-segment', leftTableX, zMid, depth, legL, { hasCableWell: false }));
  }
  if (rightSeats.length) {
    const zMid = (rightSeats[0].z + rightSeats[rightSeats.length - 1].z) / 2;
    tables.push(makeTable('u-right', 'generic-u-segment', rightTableX, zMid, depth, legL, { hasCableWell: false }));
  }
  if (backSeats.length) {
    const len = Math.max(inner, backSpan + 0.4);
    tables.push(makeTable('u-back', 'generic-u-segment', 0, backZ, len, depth, { hasCableWell: false }));
  }

  return {
    seats,
    tables,
    warnings,
    valid: placed === cfg.capacity && !warnings.some((w) => w.includes('exceeds')),
    layoutReason: 'U-shape: three table segments opening toward the presentation wall; chairs face the table.'
  };
}

function generateHollowSquare(room: RoomModel, cfg: SeatingConfig): SeatingGenerationResult {
  const u = generateUShape(room, cfg);
  const tmpl = furnitureTemplate('generic-u-segment');
  const depth = tmpl.typicalWidth;
  const spacing = cfg.seatWidth;
  const frontZ = -room.depth / 2 + cfg.frontClearance - 0.15;
  const inner = Math.min(2.6, Math.max(1.6, room.width * 0.32));
  const perFront = Math.max(0, Math.min(3, cfg.capacity - u.seats.length));
  const extra: Seat[] = [];
  let placed = u.seats.length;
  const span = Math.max(spacing, (perFront - 1) * spacing);
  for (let i = 0; i < perFront && placed < cfg.capacity; i++) {
    extra.push({
      id: `UF${i + 1}`,
      row: 4,
      indexInRow: i + 1,
      x: -span / 2 + i * spacing,
      z: frontZ,
      facing: Math.PI,
      hasTable: true,
      tableId: 'u-front'
    });
    placed++;
  }
  const warnings = [...u.warnings];
  if (placed < cfg.capacity) warnings.push(`Hollow-square layout fits ${placed} of ${cfg.capacity} requested seats.`);
  const tables = [...u.tables];
  if (extra.length) {
    tables.push(makeTable('u-front', 'generic-u-segment', 0, frontZ + tmpl.chairFromEdge + depth / 2, Math.max(inner * 0.6, span + 0.3), depth, { hasCableWell: false }));
  }
  return {
    seats: [...u.seats, ...extra],
    tables,
    warnings,
    valid: placed === cfg.capacity,
    layoutReason: 'Hollow square: U-shape plus a front segment with a gap toward the presentation wall.'
  };
}
