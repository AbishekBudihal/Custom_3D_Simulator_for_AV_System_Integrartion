/**
 * Four-sided conference / boardroom seating around one TableSpec.
 * Chairs are independent Seat entities; the table is not inferred from them.
 */

import type { RoomModel } from './RoomModel';
import {
  conferenceTemplateId,
  conferenceWidthForCapacity,
  furnitureTemplate
} from './FurnitureCatalog';
import { aabbsOverlap, openingExclusionAabb, type Aabb } from './FurnitureGeometry';
import type { Seat, SeatingConfig, SeatingGenerationResult, TableSpec } from './SeatingGenerator';

export const CHAIR_BEHIND_M = 0.45;
export const MIN_WALK_M = 0.7;

export function makeFurnitureTable(
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

export function distributeFourSides(
  n: number,
  tableWidth: number
): { left: number; right: number; front: number; back: number } {
  const maxEnds = tableWidth >= 1.15 ? 2 : tableWidth >= 0.75 ? 1 : 0;
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

export function seatsAroundConferenceTable(table: TableSpec, capacity: number, seatWidth = 0.65): Seat[] {
  const n = Math.max(1, Math.round(capacity));
  const tmpl = furnitureTemplate(table.furnitureId ?? 'generic-conference');
  const spacing = Math.max(0.6, seatWidth);
  const dist = distributeFourSides(n, Math.min(table.sizeX, table.sizeZ) < table.sizeX ? table.sizeZ : table.sizeX);
  const longIsZ = table.sizeZ >= table.sizeX;
  const chairFromEdge = tmpl.chairFromEdge;
  const seats: Seat[] = [];
  const tid = table.id;

  if (longIsZ) {
    const leftX = table.centerX - table.sizeX / 2 - chairFromEdge;
    const rightX = table.centerX + table.sizeX / 2 + chairFromEdge;
    const perLong = Math.max(dist.left, dist.right, 1);
    const z0 = table.centerZ - ((perLong - 1) * spacing) / 2;
    for (let i = 0; i < dist.left; i++) {
      seats.push(seat(`L${i + 1}`, 1, i + 1, leftX, z0 + i * spacing, -Math.PI / 2, tid));
    }
    for (let i = 0; i < dist.right; i++) {
      seats.push(seat(`R${i + 1}`, 2, i + 1, rightX, z0 + i * spacing, Math.PI / 2, tid));
    }
    const xSpan = Math.max(spacing, (Math.max(dist.front, dist.back) - 1) * spacing);
    const x0 = table.centerX - xSpan / 2;
    for (let i = 0; i < dist.front; i++) {
      seats.push(
        seat(`F${i + 1}`, 4, i + 1, dist.front === 1 ? table.centerX : x0 + i * spacing, table.centerZ - table.sizeZ / 2 - chairFromEdge, Math.PI, tid)
      );
    }
    for (let i = 0; i < dist.back; i++) {
      const id = dist.back === 1 ? 'HEAD' : `B${i + 1}`;
      seats.push(
        seat(id, 3, i + 1, dist.back === 1 ? table.centerX : x0 + i * spacing, table.centerZ + table.sizeZ / 2 + chairFromEdge, 0, tid)
      );
    }
  } else {
    const frontZ = table.centerZ - table.sizeZ / 2 - chairFromEdge;
    const backZ = table.centerZ + table.sizeZ / 2 + chairFromEdge;
    const perLong = Math.max(dist.left, dist.right, 1);
    const x0 = table.centerX - ((perLong - 1) * spacing) / 2;
    for (let i = 0; i < dist.left; i++) {
      seats.push(seat(`L${i + 1}`, 1, i + 1, x0 + i * spacing, frontZ, 0, tid));
    }
    for (let i = 0; i < dist.right; i++) {
      seats.push(seat(`R${i + 1}`, 2, i + 1, x0 + i * spacing, backZ, Math.PI, tid));
    }
    for (let i = 0; i < dist.front; i++) {
      seats.push(seat(`F${i + 1}`, 4, i + 1, table.centerX - table.sizeX / 2 - chairFromEdge, table.centerZ, -Math.PI / 2, tid));
    }
    if (dist.back) {
      seats.push(seat('HEAD', 3, 1, table.centerX + table.sizeX / 2 + chairFromEdge, table.centerZ, Math.PI / 2, tid));
    }
  }
  return seats;
}

function seat(id: string, row: number, indexInRow: number, x: number, z: number, facing: number, tableId: string): Seat {
  return { id, row, indexInRow, x: Number(x.toFixed(3)), z: Number(z.toFixed(3)), facing, hasTable: true, tableId };
}

export function roomExclusionAabbs(room: RoomModel, extra: Aabb[] = []): Aabb[] {
  const out = [...extra];
  room.openings.forEach((o) => {
    out.push(openingExclusionAabb(room, o.wall, o.offset, o.width));
  });
  return out;
}

function assemblyAabb(table: TableSpec, seats: Seat[]): Aabb {
  const boxes = [
    {
      minX: table.centerX - table.sizeX / 2,
      maxX: table.centerX + table.sizeX / 2,
      minZ: table.centerZ - table.sizeZ / 2,
      maxZ: table.centerZ + table.sizeZ / 2
    },
    ...seats.map((s) => ({
      minX: s.x - 0.22,
      maxX: s.x + 0.22,
      minZ: s.z - 0.22 - CHAIR_BEHIND_M * 0.35,
      maxZ: s.z + 0.22 + CHAIR_BEHIND_M * 0.35
    }))
  ];
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    minZ: Math.min(...boxes.map((b) => b.minZ)),
    maxZ: Math.max(...boxes.map((b) => b.maxZ))
  };
}

function hitsExclusion(box: Aabb, exclusions: Aabb[]): boolean {
  return exclusions.some((e) => aabbsOverlap(box, e, 0.02));
}

export function generateConferenceLayout(room: RoomModel, cfg: SeatingConfig): SeatingGenerationResult {
  const warnings: string[] = [];
  const n = cfg.capacity;
  const tmplId = conferenceTemplateId(n);
  const tmpl = furnitureTemplate(tmplId);
  const tableW = conferenceWidthForCapacity(n);
  const spacing = Math.max(0.6, cfg.seatWidth);
  const dist = distributeFourSides(n, tableW);
  const perLong = Math.max(dist.left, dist.right, 1);
  const tableL = perLong * spacing + 0.28;
  const front = Math.max(1.5, Math.min(cfg.frontClearance, tmpl.clearanceFront));
  const rearNeed = tableL / 2 + (dist.back ? tmpl.chairFromEdge + CHAIR_BEHIND_M : 0.15) + MIN_WALK_M;
  let centerZ = -room.depth / 2 + front + tableL / 2;
  const maxCenterZ = room.depth / 2 - rearNeed;
  if (centerZ > maxCenterZ) centerZ = (-room.depth / 2 + front + tableL / 2 + maxCenterZ) / 2;

  let table = makeFurnitureTable('conference-table', tmplId, 0, centerZ, tableW, tableL);
  let seats = seatsAroundConferenceTable(table, n, spacing);
  const exclusions = roomExclusionAabbs(room, cfg.exclusions ?? []);

  const tryShift = [0, 0.35, -0.35, 0.7, -0.7, 1.0, -1.0];
  let placed = false;
  for (const dx of tryShift) {
    if (placed) break;
    for (const dz of [0, 0.25, -0.25, 0.5, -0.5]) {
      const cand = { ...table, centerX: 0 + dx, centerZ: centerZ + dz };
      const candSeats = seatsAroundConferenceTable(cand, n, spacing);
      const box = assemblyAabb(cand, candSeats);
      const inside =
        box.minX >= -room.width / 2 + 0.25 &&
        box.maxX <= room.width / 2 - 0.25 &&
        box.minZ >= -room.depth / 2 + 0.25 &&
        box.maxZ <= room.depth / 2 - 0.25;
      if (inside && !hitsExclusion(box, exclusions)) {
        table = cand;
        seats = candSeats;
        placed = true;
        break;
      }
    }
  }

  const box = assemblyAabb(table, seats);
  if (hitsExclusion(box, exclusions)) {
    warnings.push('Conference furniture is close to a door/window exclusion or reserved service area.');
  }
  if (box.minX < -room.width / 2 + 0.3 || box.maxX > room.width / 2 - 0.3) {
    warnings.push(`${n} seats cannot be accommodated with the selected room width and required circulation.`);
  }
  if (box.minZ < -room.depth / 2 + 0.3 || box.maxZ > room.depth / 2 - 0.3) {
    warnings.push(`${n} seats cannot be accommodated with the selected room length and required circulation.`);
  }
  const sideClear = room.width / 2 - Math.max(Math.abs(box.minX), Math.abs(box.maxX));
  if (sideClear < cfg.sideClearance) {
    warnings.push(`Side circulation ${sideClear.toFixed(2)} m is below the ${cfg.sideClearance} m target.`);
  }

  const valid = seats.length === n && warnings.filter((w) => w.includes('cannot be accommodated')).length === 0;
  return {
    seats,
    tables: [table],
    warnings,
    valid,
    layoutReason: `Conference/boardroom: one ${tableW.toFixed(2)} × ${tableL.toFixed(2)} m table with ${n} independent chairs on the table edges, sized from occupancy and circulation — not from room width.`
  };
}
