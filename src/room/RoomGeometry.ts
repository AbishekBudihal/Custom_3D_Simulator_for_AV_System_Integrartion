/**
 * RoomGeometry.ts
 * ────────────────────────────────────────────────────────────
 * The spatial "ground truth" for the room: which wall is which, how a
 * position measured along a wall maps to world x/z, which direction a
 * wall faces, and — critically — a single definition of "which way does
 * a seat with a given facing angle actually look".
 *
 * Before this module existed, SeatingRenderer, PlanRenderer, and
 * SceneManager each re-derived that last piece independently (their own
 * sin/cos sign choices for "the direction the seat faces"), and they
 * didn't all agree. That's what produced chairs whose backrests ended up
 * on the wrong side of the seat. Every module that needs a seat's facing
 * direction, or needs to reason about "which wall is the display on",
 * must go through the functions here instead of re-deriving the trig
 * locally.
 *
 * No Three.js here — this is pure geometry, usable by SeatingGenerator,
 * PlacementSuggestionEngine, DesignAnalysis, and tests without pulling in
 * a renderer.
 * ────────────────────────────────────────────────────────────
 */

import type { RoomModel } from './RoomModel';

export type WallKey = 'front' | 'back' | 'left' | 'right';
export const WALL_KEYS: WallKey[] = ['front', 'back', 'left', 'right'];

// ── Seat orientation convention ─────────────────────────────
// A seat's `facing` is a yaw in radians. facing = 0 means the seat looks
// toward -Z — i.e. toward the room's canonical "front" wall. Every other
// facing value is measured the same way makeRotationY() rotates things in
// Three.js (see the derivation of presentationRotation below), so the
// same angle can drive both the physical chair rotation AND "which way is
// this person looking" without translation between two different
// conventions.
export function seatForward(facingRad: number): { x: number; z: number } {
  return { x: -Math.sin(facingRad), z: -Math.cos(facingRad) };
}

export function normalizeAngle(a: number): number {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

/**
 * Rotation that maps the canonical presentation frame (presentation wall
 * = "front", at local z = -depth/2, seats facing -Z toward it) onto
 * `wall`'s actual position in the room. Used both to re-orient generated
 * seating and to compute a display's mounting rotation for that wall —
 * they must always agree, so both read this instead of keeping their own
 * copy.
 */
export function presentationRotation(wall: WallKey): number {
  switch (wall) {
    case 'front': return 0;
    case 'back': return Math.PI;
    case 'left': return Math.PI / 2;
    case 'right': return -Math.PI / 2;
  }
}

/** Rotates a point (or a direction vector) from the canonical frame into
 *  world space by `rot` (see presentationRotation). Both position and
 *  direction transform the same way because RoomModel coordinates are
 *  centered on the room's center — there's no translation, only rotation. */
export function rotatePoint(x: number, z: number, rot: number): { x: number; z: number } {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: x * c + z * s, z: -x * s + z * c };
}

export function wallLength(room: RoomModel, wall: WallKey): number {
  return wall === 'front' || wall === 'back' ? room.width : room.depth;
}

/** The direction pointing OUT of the room through `wall` — also the
 *  direction a seat looking at a display mounted on that wall faces
 *  (you look toward the wall, i.e. toward its outward normal). */
export function wallOutwardNormal(wall: WallKey): { x: number; z: number } {
  switch (wall) {
    case 'front': return { x: 0, z: -1 };
    case 'back': return { x: 0, z: 1 };
    case 'left': return { x: -1, z: 0 };
    case 'right': return { x: 1, z: 0 };
  }
}

/**
 * World x/z on `wall`'s inner face for a position measured along the wall
 * from its local origin — the SAME convention RoomGenerator uses to place
 * door/window cutouts (Opening.offset), so a candidate span computed here
 * lines up exactly with the geometry that gets built.
 */
export function wallOffsetToWorld(room: RoomModel, wall: WallKey, offsetAlongWall: number): { x: number; z: number } {
  const hw = room.width / 2;
  const hd = room.depth / 2;
  switch (wall) {
    case 'front': return { x: -hw + offsetAlongWall, z: -hd };
    case 'back': return { x: hw - offsetAlongWall, z: hd };
    case 'left': return { x: -hw, z: hd - offsetAlongWall };
    case 'right': return { x: hw, z: -hd + offsetAlongWall };
  }
}

/** World x/z of the midpoint of `wall`'s face — the natural "what am I
 *  facing toward" reference point for a wall, independent of any specific
 *  opening or display on it. */
export function wallCenter(room: RoomModel, wall: WallKey): { x: number; z: number } {
  return wallOffsetToWorld(room, wall, wallLength(room, wall) / 2);
}

/** Inverse of wallOffsetToWorld. */
export function worldToWallOffset(room: RoomModel, wall: WallKey, x: number, z: number): number {
  const hw = room.width / 2;
  const hd = room.depth / 2;
  switch (wall) {
    case 'front': return x + hw;
    case 'back': return hw - x;
    case 'left': return hd - z;
    case 'right': return z + hd;
  }
}

/** A point `inset` meters into the room from `wall`'s face, at the given
 *  along-wall offset — where equipment actually mounts (just proud of the
 *  wall surface), not the exact wall plane. */
export function wallMountPoint(room: RoomModel, wall: WallKey, offsetAlongWall: number, inset: number): { x: number; z: number } {
  const face = wallOffsetToWorld(room, wall, offsetAlongWall);
  const n = wallOutwardNormal(wall);
  return { x: face.x - n.x * inset, z: face.z - n.z * inset };
}

// ── Wall candidate scoring (§1/§7 of the spatial model) ─────
export interface WallObstacleInfo {
  kind: 'door' | 'window';
  id?: string;
  /** Exclusion zone along the wall, in meters from the wall's local origin
   *  — already padded by a clearance margin, so a candidate span outside
   *  this range is genuinely clear, not just technically non-overlapping. */
  startOffsetM: number;
  endOffsetM: number;
}

export interface WallCandidate {
  wall: WallKey;
  wallLengthM: number;
  /** Width of the widest clear (door/window-free) contiguous span on this wall. */
  usableWidthM: number;
  /** Where that span starts, in along-wall offset meters — use with
   *  wallMountPoint/wallOffsetToWorld to place something centered in it. */
  bestSpanStartM: number;
  usableHeightM: number;
  hasDoor: boolean;
  hasWindow: boolean;
  obstacles: WallObstacleInfo[];
  /** True once a required width/height (if given) is actually satisfied by
   *  the best clear span — NOT just "no door", since a wall can be
   *  door-free and still too short/narrow. */
  valid: boolean;
  score: number;
  reasons: string[];
}

const DOOR_CLEARANCE_M = 0.3;
const WINDOW_CLEARANCE_M = 0.15;

function wallClearSpans(room: RoomModel, wall: WallKey): { spans: Array<[number, number]>; obstacles: WallObstacleInfo[] } {
  const len = wallLength(room, wall);
  const obstacles: WallObstacleInfo[] = room.openings
    .filter((o) => o.wall === wall)
    .map((o) => {
      const margin = o.kind === 'door' ? DOOR_CLEARANCE_M : WINDOW_CLEARANCE_M;
      return {
        kind: o.kind,
        id: o.id,
        startOffsetM: Math.max(0, o.offset - margin),
        endOffsetM: Math.min(len, o.offset + o.width + margin)
      };
    })
    .sort((a, b) => a.startOffsetM - b.startOffsetM);

  const spans: Array<[number, number]> = [];
  let cursor = 0;
  for (const ob of obstacles) {
    if (ob.startOffsetM > cursor) spans.push([cursor, ob.startOffsetM]);
    cursor = Math.max(cursor, ob.endOffsetM);
  }
  if (cursor < len) spans.push([cursor, len]);
  return { spans, obstacles };
}

/**
 * Scores all four walls as candidate mounting/presentation surfaces.
 * `requiredWidthM`/`requiredHeightM` are the footprint that actually
 * needs to fit (0 if the caller just wants a general "which wall is best
 * oriented" answer, e.g. for choosing a presentation wall before any
 * display exists). Doors and windows both carve exclusion zones out of a
 * wall's usable span — a wall is never scored as if an opening weren't
 * there, and a candidate's position is never allowed to overlap one.
 * Returned sorted best-first; ties keep front > back > left > right.
 */
export function computeWallCandidates(room: RoomModel, requiredWidthM = 0, requiredHeightM = 0): WallCandidate[] {
  return WALL_KEYS.map((wall) => {
    const len = wallLength(room, wall);
    const { spans, obstacles } = wallClearSpans(room, wall);

    let best: [number, number] = [0, 0];
    for (const s of spans) {
      if (s[1] - s[0] > best[1] - best[0]) best = s;
    }
    const usableWidthM = Number((best[1] - best[0]).toFixed(2));
    const hasDoor = obstacles.some((o) => o.kind === 'door');
    const hasWindow = obstacles.some((o) => o.kind === 'window');
    // Vertical clearance isn't modeled per-opening here (openings are
    // excluded from the horizontal span entirely instead, which is the
    // check that actually matters for "never on a door") — usableHeightM
    // is the room's ceiling height minus a nominal top clearance.
    const usableHeightM = Number((room.height - 0.15).toFixed(2));

    const reasons: string[] = [];
    if (hasDoor) reasons.push('door on this wall (excluded from mounting area)');
    if (hasWindow) reasons.push('window on this wall (excluded from mounting area)');

    const valid = usableWidthM >= requiredWidthM && usableHeightM >= requiredHeightM;
    if (requiredWidthM > 0 && usableWidthM < requiredWidthM) {
      reasons.push(`only ${usableWidthM.toFixed(1)}m clear, needs ${requiredWidthM.toFixed(1)}m`);
    }

    let score = usableWidthM * 10 - obstacles.length * 8;
    if (hasDoor) score -= 28;
    if (hasWindow) score -= 16;
    if (!valid) score -= 1000;
    score = Number(score.toFixed(1));

    const candidate: WallCandidate = {
      wall,
      wallLengthM: len,
      usableWidthM,
      bestSpanStartM: Number(best[0].toFixed(2)),
      usableHeightM,
      hasDoor,
      hasWindow,
      obstacles,
      valid,
      score,
      reasons
    };
    return candidate;
  }).sort((a, b) => b.score - a.score);
}

/**
 * Picks the best wall to orient the room's presentation direction toward,
 * independent of any specific product — used to orient seating and as the
 * default before a display is placed. Prefers a door/window-free wall
 * with the most usable width; only degrades to an obstructed wall if
 * every wall has one.
 */
export function determinePresentationWall(room: RoomModel): WallKey {
  const candidates = computeWallCandidates(room, 1.0, 0);
  const best = candidates.find((c) => c.valid) ?? candidates[0];
  return best.wall;
}

/** The room's actual presentation wall — the explicit override if the
 *  engineer set one, otherwise the automatically determined best wall.
 *  Every module that needs "which wall is the front of the room" should
 *  call this rather than assuming 'front'. */
export function getPresentationWall(room: RoomModel): WallKey {
  return room.presentationWall ?? determinePresentationWall(room);
}
