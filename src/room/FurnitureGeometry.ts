/**
 * Shared AABB / clearance helpers for furniture. Used by validation and
 * table snapping — not by the renderer to invent tables.
 */

import type { RoomModel } from './RoomModel';
import { wallOffsetToWorld, wallOutwardNormal, getPresentationWall, type WallKey } from './RoomGeometry';
import type { Seat, TableSpec } from './SeatingGenerator';

export const WALL_CLEARANCE_M = 0.35;
export const WALKWAY_CLEARANCE_M = 0.7;
export const CHAIR_HALF_M = 0.22;
export const PRESENTATION_ZONE_M = 1.2;
export const OPENING_INSET_M = 0.55;

export interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function tableAabb(t: TableSpec): Aabb {
  return {
    minX: t.centerX - t.sizeX / 2,
    maxX: t.centerX + t.sizeX / 2,
    minZ: t.centerZ - t.sizeZ / 2,
    maxZ: t.centerZ + t.sizeZ / 2
  };
}

export function chairAabb(s: Seat): Aabb {
  return {
    minX: s.x - CHAIR_HALF_M,
    maxX: s.x + CHAIR_HALF_M,
    minZ: s.z - CHAIR_HALF_M,
    maxZ: s.z + CHAIR_HALF_M
  };
}

export function aabbsOverlap(a: Aabb, b: Aabb, eps = 0.01): boolean {
  return a.minX < b.maxX - eps && a.maxX > b.minX + eps && a.minZ < b.maxZ - eps && a.maxZ > b.minZ + eps;
}

export function aabbInsideRoom(room: RoomModel, box: Aabb, margin = WALL_CLEARANCE_M): boolean {
  return (
    box.minX >= -room.width / 2 + margin &&
    box.maxX <= room.width / 2 - margin &&
    box.minZ >= -room.depth / 2 + margin &&
    box.maxZ <= room.depth / 2 - margin
  );
}

export function minWallClearance(room: RoomModel, box: Aabb): number {
  return Math.min(
    box.minX - (-room.width / 2),
    room.width / 2 - box.maxX,
    box.minZ - (-room.depth / 2),
    room.depth / 2 - box.maxZ
  );
}

export function openingExclusionAabb(room: RoomModel, wall: WallKey, offset: number, width: number): Aabb {
  const mid = wallOffsetToWorld(room, wall, offset + width / 2);
  const n = wallOutwardNormal(wall);
  const inwardX = mid.x - n.x * (OPENING_INSET_M / 2);
  const inwardZ = mid.z - n.z * (OPENING_INSET_M / 2);
  const along = width / 2 + 0.15;
  if (wall === 'front' || wall === 'back') {
    return {
      minX: inwardX - along,
      maxX: inwardX + along,
      minZ: Math.min(mid.z, inwardZ) - 0.05,
      maxZ: Math.max(mid.z, inwardZ) + OPENING_INSET_M / 2
    };
  }
  return {
    minX: Math.min(mid.x, inwardX) - 0.05,
    maxX: Math.max(mid.x, inwardX) + OPENING_INSET_M / 2,
    minZ: inwardZ - along,
    maxZ: inwardZ + along
  };
}

export function presentationZoneAabb(room: RoomModel): Aabb {
  const wall = getPresentationWall(room);
  const hw = room.width / 2;
  const hd = room.depth / 2;
  if (wall === 'front') return { minX: -hw, maxX: hw, minZ: -hd, maxZ: -hd + PRESENTATION_ZONE_M };
  if (wall === 'back') return { minX: -hw, maxX: hw, minZ: hd - PRESENTATION_ZONE_M, maxZ: hd };
  if (wall === 'left') return { minX: -hw, maxX: -hw + PRESENTATION_ZONE_M, minZ: -hd, maxZ: hd };
  return { minX: hw - PRESENTATION_ZONE_M, maxX: hw, minZ: -hd, maxZ: hd };
}

export function clampTableCenter(room: RoomModel, t: TableSpec, x: number, z: number): { x: number; z: number } {
  const hx = room.width / 2 - t.sizeX / 2 - WALL_CLEARANCE_M;
  const hz = room.depth / 2 - t.sizeZ / 2 - WALL_CLEARANCE_M;
  return {
    x: Number(Math.max(-hx, Math.min(hx, x)).toFixed(3)),
    z: Number(Math.max(-hz, Math.min(hz, z)).toFixed(3))
  };
}
