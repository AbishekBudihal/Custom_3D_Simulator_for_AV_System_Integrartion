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
import { getPresentationWall, presentationRotation, rotatePoint, normalizeAngle } from './RoomGeometry';
import {
  conferenceTemplateId,
  conferenceWidthForCapacity,
  furnitureTemplate,
  type FurnitureShape
} from './FurnitureCatalog';

export type SeatingLayout =
  | 'boardroom'
  | 'classroom'
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
      return generateBoardroom(room, cfg);
    case 'classroom':
      return generateClassroom(room, cfg);
    case 'theater':
    case 'auditorium_tiered':
      return generateTheater(room, cfg);
    case 'u_shape':
      return generateUShape(room, cfg);
    case 'hollow_square':
      return generateHollowSquare(room, cfg);
    default:
      return generateClassroom(room, cfg);
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

function distributeConference(n: number): { left: number; right: number; head: number } {
  if (n <= 2) return { left: 1, right: n === 2 ? 1 : 0, head: 0 };
  if (n <= 6) {
    const left = Math.ceil(n / 2);
    return { left, right: n - left, head: 0 };
  }
  const head = 1;
  const sides = n - head;
  const left = Math.ceil(sides / 2);
  return { left, right: sides - left, head };
}

function generateBoardroom(room: RoomModel, cfg: SeatingConfig): SeatingGenerationResult {
  const warnings: string[] = [];
  const seats: Seat[] = [];
  const n = cfg.capacity;
  const tmplId = conferenceTemplateId(n);
  const tmpl = furnitureTemplate(tmplId);
  const tableW = conferenceWidthForCapacity(n);
  const spacing = Math.max(0.6, cfg.seatWidth);
  const dist = distributeConference(n);
  const perLong = Math.max(dist.left, dist.right, 1);
  const tableL = perLong * spacing + 0.28;
  const chairFromEdge = tmpl.chairFromEdge;
  const needHalfW = tableW / 2 + chairFromEdge + CHAIR_BEHIND + MIN_WALK;
  const front = Math.max(1.5, Math.min(cfg.frontClearance, tmpl.clearanceFront));
  const rearNeed = tableL / 2 + (dist.head ? chairFromEdge + CHAIR_BEHIND : 0.1) + Math.max(MIN_WALK, cfg.rearClearance * 0.75);

  let centerZ = -room.depth / 2 + front + tableL / 2;
  const maxCenterZ = room.depth / 2 - rearNeed;
  if (centerZ > maxCenterZ) centerZ = ( -room.depth / 2 + front + tableL / 2 + maxCenterZ) / 2;

  const table: TableSpec = makeTable('conference-table', tmplId, 0, centerZ, tableW, tableL);

  const leftX = table.centerX - tableW / 2 - chairFromEdge;
  const rightX = table.centerX + tableW / 2 + chairFromEdge;
  const z0 = table.centerZ - ((perLong - 1) * spacing) / 2;

  const placeSide = (count: number, x: number, facing: number, prefix: string, row: number) => {
    for (let i = 0; i < count; i++) {
      seats.push({
        id: `${prefix}${i + 1}`,
        row,
        indexInRow: i + 1,
        x,
        z: z0 + i * spacing,
        facing,
        hasTable: true
      });
    }
  };
  placeSide(dist.left, leftX, -Math.PI / 2, 'L', 1);
  placeSide(dist.right, rightX, Math.PI / 2, 'R', 2);
  if (dist.head) {
    seats.push({
      id: 'HEAD',
      row: 3,
      indexInRow: 1,
      x: 0,
      z: table.centerZ + tableL / 2 + chairFromEdge,
      facing: 0,
      hasTable: true
    });
  }

  const envelopeHalfW = Math.max(Math.abs(leftX), Math.abs(rightX)) + CHAIR_BEHIND;
  const minZ = Math.min(...seats.map((s) => s.z), table.centerZ - tableL / 2);
  const maxZ = Math.max(...seats.map((s) => s.z), table.centerZ + tableL / 2);
  if (needHalfW > room.width / 2 || envelopeHalfW + MIN_WALK > room.width / 2) {
    warnings.push(
      `${n} seats cannot be accommodated with the selected room width and required circulation.`
    );
  }
  if (minZ < -room.depth / 2 + 0.3 || maxZ + CHAIR_BEHIND > room.depth / 2 - 0.3) {
    warnings.push(
      `${n} seats cannot be accommodated with the selected room length and required circulation.`
    );
  }
  const sideClear = room.width / 2 - envelopeHalfW;
  if (sideClear < cfg.sideClearance) {
    warnings.push(`Side circulation ${sideClear.toFixed(2)} m is below the ${cfg.sideClearance} m target.`);
  }

  const valid = seats.length === n && warnings.filter((w) => w.includes('cannot be accommodated')).length === 0;
  if (seats.length < n) {
    warnings.push(`Conference layout placed ${seats.length} of ${n} requested seats.`);
  }

  return {
    seats,
    tables: [table],
    warnings,
    valid,
    layoutReason: `Conference table (${tableW.toFixed(2)} × ${tableL.toFixed(2)} m) sized from ${n} seats and circulation, not from room width.`
  };
}

function generateClassroom(room: RoomModel, cfg: SeatingConfig): SeatingGenerationResult {
  const seats: Seat[] = [];
  const tables: TableSpec[] = [];
  const warnings: string[] = [];
  const desk = furnitureTemplate('generic-training-desk');
  const usableW = room.width - 2 * cfg.sideClearance;
  const seatsPerRow = Math.max(1, Math.floor(usableW / cfg.seatWidth));
  const usableDepth = room.depth - cfg.frontClearance - cfg.rearClearance;
  const maxRows = Math.max(1, Math.floor(usableDepth / cfg.rowPitch) + 1);
  const deskDepth = desk.typicalWidth;

  let placed = 0;
  let row = 0;
  while (placed < cfg.capacity && row < maxRows) {
    const inThisRow = Math.min(seatsPerRow, cfg.capacity - placed);
    const rowSpan = Math.max(cfg.seatWidth, (inThisRow - 1) * cfg.seatWidth);
    const startX = -rowSpan / 2;
    const seatZ = -room.depth / 2 + cfg.frontClearance + row * cfg.rowPitch;
    const deskZ = seatZ - desk.chairFromEdge - deskDepth / 2;
    const deskLen = inThisRow * cfg.seatWidth * 0.92;
    tables.push(
      makeTable(`desk-${row + 1}`, 'generic-training-desk', 0, deskZ, deskLen, deskDepth, { shape: 'rect', hasCableWell: false })
    );
    for (let s = 0; s < inThisRow; s++) {
      seats.push({
        id: `R${row + 1}-S${s + 1}`,
        row: row + 1,
        indexInRow: s + 1,
        x: startX + s * cfg.seatWidth,
        z: seatZ,
        facing: 0,
        hasTable: true
      });
      placed++;
    }
    row++;
  }

  if (placed < cfg.capacity) {
    warnings.push(
      `${cfg.capacity} seats cannot be accommodated with the selected room dimensions and required circulation. Placed ${placed}.`
    );
  }

  return {
    seats,
    tables,
    warnings,
    valid: placed === cfg.capacity,
    layoutReason: `Classroom: one training desk per row, length from seats in that row (${tables.length} desk(s)).`
  };
}

function generateTheater(room: RoomModel, cfg: SeatingConfig): SeatingGenerationResult {
  const tightCfg: SeatingConfig = { ...cfg, rowPitch: Math.max(0.9, cfg.rowPitch * 0.85) };
  const result = generateClassroom(room, tightCfg);
  result.seats.forEach((s) => (s.hasTable = false));
  return {
    ...result,
    tables: [],
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
      hasTable: true
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
      hasTable: true
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
      hasTable: true
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
      hasTable: true
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
