/**
 * Candidate placement scoring for AV equipment.
 *
 * Geometric wall spans still come from RoomGeometry.computeWallCandidates.
 * This module adds AV planning criteria derived from typical conference /
 * training rooms: presentation direction vs seating, doors as circulation
 * (not just a hole in a wall), windows as glare risk, and viewing coverage
 * from the existing display analysis engine — not a second calculator.
 */

import type { EquipmentProduct } from '../../catalog/EquipmentCatalog';
import type { RoomModel, RoomZone } from '../../room/RoomModel';
import type { Seat, TableSpec } from '../../room/SeatingGenerator';
import {
  computeWallCandidates,
  presentationRotation,
  seatForward,
  wallMountPoint,
  type WallCandidate,
  type WallKey
} from '../../room/RoomGeometry';
import { aabbsOverlap, openingExclusionAabb, tableAabb, type Aabb } from '../../room/FurnitureGeometry';
import { analyzeAllSeatsAgainstDisplay, projectObstacles } from '../DesignAnalysis';

const OPPOSITE: Record<WallKey, WallKey> = { front: 'back', back: 'front', left: 'right', right: 'left' };
const TIE_ORDER: WallKey[] = ['front', 'back', 'left', 'right'];
const DISPLAY_SIDE_CLEARANCE_M = 0.3;

/** Weights reflect planning priority, not an invented "score standard". */
const W = {
  reject: -10000,
  doorOnWall: -45,
  windowOnWall: -22,
  adjacentDoor: -18,
  usableWidth: 1,
  viewingThrow: 2.2,
  oppositeDoor: 14,
  facingSeats: 28,
  viewingPass: 36,
  viewingFail: -8
};

export interface PlacementScoreContext {
  seats?: Seat[];
  tables?: TableSpec[];
  product?: EquipmentProduct;
  zone?: RoomZone;
}

export interface ScoredPlacementCandidate {
  wall: WallKey;
  geometric: WallCandidate;
  score: number;
  rejected: boolean;
  reasons: string[];
}

export function primaryDoorWall(room: RoomModel): WallKey | null {
  const doors = room.openings.filter((o) => o.kind === 'door');
  if (!doors.length) return null;
  const byWall = new Map<WallKey, number>();
  doors.forEach((d) => byWall.set(d.wall, (byWall.get(d.wall) ?? 0) + d.width));
  let best: WallKey | null = null;
  let width = -1;
  byWall.forEach((w, wall) => {
    if (w > width) {
      width = w;
      best = wall;
    }
  });
  return best;
}

function viewingThrowM(room: RoomModel, wall: WallKey): number {
  return wall === 'front' || wall === 'back' ? room.depth : room.width;
}

function facingFraction(seats: Seat[], wall: WallKey): number {
  if (!seats.length) return 0;
  const n = wallOutwardFromFacing(wall);
  let facing = 0;
  seats.forEach((s) => {
    const f = seatForward(s.facing);
    if (f.x * n.x + f.z * n.z > 0.35) facing += 1;
  });
  return facing / seats.length;
}

function wallOutwardFromFacing(wall: WallKey): { x: number; z: number } {
  switch (wall) {
    case 'front':
      return { x: 0, z: -1 };
    case 'back':
      return { x: 0, z: 1 };
    case 'left':
      return { x: -1, z: 0 };
    case 'right':
      return { x: 1, z: 0 };
  }
}

function spanAdjacentToDoor(c: WallCandidate): boolean {
  if (!c.hasDoor) return false;
  return c.obstacles.some((o) => {
    if (o.kind !== 'door') return false;
    const gapStart = Math.abs(c.bestSpanStartM - o.endOffsetM);
    const gapEnd = Math.abs(c.bestSpanStartM + c.usableWidthM - o.startOffsetM);
    return Math.min(gapStart, gapEnd) < 0.08;
  });
}

function zoneWallPenalty(room: RoomModel, zone: RoomZone | undefined, wall: WallKey): number {
  if (!zone) return 0;
  const hw = room.width / 2;
  const hd = room.depth / 2;
  const interior = 0.35;
  if (wall === 'left' && zone.minX > -hw + interior) return -20;
  if (wall === 'right' && zone.maxX < hw - interior) return -20;
  if (wall === 'front' && zone.minZ > -hd + interior) return -20;
  if (wall === 'back' && zone.maxZ < hd - interior) return -20;
  return 0;
}

function viewingScore(
  room: RoomModel,
  wall: WallKey,
  product: EquipmentProduct,
  seats: Seat[],
  tables: TableSpec[]
): { score: number; reasons: string[] } {
  if (!product.display || !seats.length) return { score: 0, reasons: [] };
  const pose = mountPose(room, wall, product);
  const analyses = analyzeAllSeatsAgainstDisplay(
    seats,
    {
      diagonalInches: product.display.diagonalInches,
      aspectRatio: product.display.aspectRatio,
      widthM: product.physical.width,
      heightM: product.physical.height,
      position: { x: pose.x, y: pose.y, z: pose.z },
      wall,
      rotationY: pose.rotationY
    },
    projectObstacles(room, tables)
  );
  const pass = analyses.filter((a) => a.overall === 'pass').length;
  const fail = analyses.filter((a) => a.overall === 'fail').length;
  const reasons: string[] = [`viewing ${pass}/${seats.length} pass (existing engine)`];
  if (fail) reasons.push(`${fail} seats fail viewing guidance`);
  return {
    score: W.viewingPass * (seats.length ? pass / seats.length : 0) + W.viewingFail * fail,
    reasons
  };
}

export function mountPose(
  room: RoomModel,
  wall: WallKey,
  product: EquipmentProduct
): { x: number; y: number; z: number; rotationY: number; fits: boolean } {
  const widthM = product.physical.width + DISPLAY_SIDE_CLEARANCE_M;
  const candidate = computeWallCandidates(room, widthM, 0).find((c) => c.wall === wall)!;
  const along = candidate.bestSpanStartM + candidate.usableWidthM / 2;
  const inset = room.wallThickness + 0.03;
  const { x, z } = wallMountPoint(room, wall, along, inset);
  const screenH = product.physical.height || 1;
  const y = Number(Math.min(1.2 + screenH / 2, room.height - 0.25).toFixed(2));
  return {
    x: Number(x.toFixed(2)),
    y,
    z: Number(z.toFixed(2)),
    rotationY: presentationRotation(wall),
    fits: candidate.valid
  };
}

export function scorePlacementWalls(room: RoomModel, ctx: PlacementScoreContext = {}): ScoredPlacementCandidate[] {
  const required = ctx.product ? ctx.product.physical.width + DISPLAY_SIDE_CLEARANCE_M : 1;
  const geometric = computeWallCandidates(room, required, 0);
  const doorWall = primaryDoorWall(room);
  const seats = ctx.zone
    ? (ctx.seats ?? []).filter(
        (s) => s.x >= ctx.zone!.minX && s.x <= ctx.zone!.maxX && s.z >= ctx.zone!.minZ && s.z <= ctx.zone!.maxZ
      )
    : ctx.seats ?? [];

  return geometric
    .map((g) => {
      const reasons: string[] = [...g.reasons];
      let score = W.usableWidth * g.usableWidthM + W.viewingThrow * viewingThrowM(room, g.wall);
      let rejected = !g.valid;
      if (rejected) {
        score += W.reject;
        reasons.push('insufficient clear span');
      }
      if (g.hasDoor) {
        score += W.doorOnWall;
        reasons.push('door on this wall — circulation conflicts with a presentation surface');
      }
      if (g.hasWindow) {
        score += W.windowOnWall;
        reasons.push('window on this wall — glare / impractical mounting risk');
      }
      if (spanAdjacentToDoor(g)) {
        score += W.adjacentDoor;
        reasons.push('clearest span sits beside a door');
      }
      if (doorWall && g.wall === OPPOSITE[doorWall] && !g.hasDoor) {
        score += W.oppositeDoor;
        reasons.push('opposite primary entry — typical presentation wall');
      }
      score += zoneWallPenalty(room, ctx.zone, g.wall);
      if (seats.length) {
        const frac = facingFraction(seats, g.wall);
        score += W.facingSeats * frac;
        if (frac > 0.4) reasons.push(`${Math.round(frac * 100)}% of seats already face this wall`);
      }
      if (ctx.product?.display && seats.length) {
        const v = viewingScore(room, g.wall, ctx.product, seats, ctx.tables ?? []);
        score += v.score;
        reasons.push(...v.reasons);
      }
      return {
        wall: g.wall,
        geometric: g,
        score: Number(score.toFixed(2)),
        rejected,
        reasons
      };
    })
    .sort((a, b) => {
      if (a.rejected !== b.rejected) return a.rejected ? 1 : -1;
      if (b.score !== a.score) return b.score - a.score;
      return TIE_ORDER.indexOf(a.wall) - TIE_ORDER.indexOf(b.wall);
    });
}

export function selectPresentationWall(room: RoomModel, ctx: PlacementScoreContext = {}): WallKey {
  const ranked = scorePlacementWalls(room, ctx);
  const best = ranked.find((c) => !c.rejected) ?? ranked[0];
  return best.wall;
}

export function displayNearOpening(
  room: RoomModel,
  position: { x: number; y: number; z: number },
  kind: 'door' | 'window',
  extraM = 0.35
): boolean {
  const box: Aabb = {
    minX: position.x - 0.4,
    maxX: position.x + 0.4,
    minZ: position.z - 0.4,
    maxZ: position.z + 0.4
  };
  return room.openings
    .filter((o) => o.kind === kind)
    .some((o) => {
      const ex = openingExclusionAabb(room, o.wall, o.offset, o.width);
      const grown: Aabb = {
        minX: ex.minX - extraM,
        maxX: ex.maxX + extraM,
        minZ: ex.minZ - extraM,
        maxZ: ex.maxZ + extraM
      };
      return aabbsOverlap(box, grown, 0.02);
    });
}

export function displayIntersectsOpeningClearance(
  room: RoomModel,
  position: { x: number; y: number; z: number }
): boolean {
  return displayNearOpening(room, position, 'door', 0);
}

export function furnitureBlocksMount(tables: TableSpec[], position: { x: number; z: number }): boolean {
  return tables.some((t) => {
    const b = tableAabb(t);
    return position.x >= b.minX && position.x <= b.maxX && position.z >= b.minZ && position.z <= b.maxZ;
  });
}
