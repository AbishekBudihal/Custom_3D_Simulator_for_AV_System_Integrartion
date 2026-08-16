/**
 * SnapEngine.ts
 * Pure snapping logic for direct manipulation. Uses RoomGeometry's
 * wall-candidate / exclusion-zone data so snapped positions never land
 * on doors, windows, or invalid wall sections.
 */

import type { RoomModel } from '../room/RoomModel';
import type { EquipmentProduct } from '../catalog/EquipmentCatalog';
import {
  computeWallCandidates,
  presentationRotation,
  wallMountPoint,
  worldToWallOffset,
  type WallKey
} from '../room/RoomGeometry';

const DISPLAY_SIDE_CLEARANCE_M = 0.3;
const CEILING_INSET_M = 0.15;

export interface SnapResult {
  position: { x: number; y: number; z: number };
  rotationY: number;
  wall?: WallKey;
  snapKind: 'wall' | 'ceiling' | 'floor' | 'none';
  /** Human-readable note for the status bar / inspector. */
  note: string;
}

function nearestWall(room: RoomModel, x: number, z: number): WallKey {
  const hw = room.width / 2;
  const hd = room.depth / 2;
  const dists: Array<[WallKey, number]> = [
    ['front', Math.abs(z + hd)],
    ['back', Math.abs(z - hd)],
    ['left', Math.abs(x + hw)],
    ['right', Math.abs(x - hw)]
  ];
  dists.sort((a, b) => a[1] - b[1]);
  return dists[0][0];
}

function clampOffsetToClearSpan(
  room: RoomModel,
  wall: WallKey,
  offsetAlongWall: number,
  halfWidthM: number
): { offset: number; clamped: boolean } {
  const candidate = computeWallCandidates(room, halfWidthM * 2, 0).find((c) => c.wall === wall)!;
  const spanStart = candidate.bestSpanStartM + halfWidthM;
  const spanEnd = candidate.bestSpanStartM + candidate.usableWidthM - halfWidthM;
  if (spanEnd < spanStart) {
    const center = candidate.bestSpanStartM + candidate.usableWidthM / 2;
    return { offset: center, clamped: true };
  }
  const clampedOffset = Math.max(spanStart, Math.min(spanEnd, offsetAlongWall));
  return { offset: clampedOffset, clamped: Math.abs(clampedOffset - offsetAlongWall) > 0.01 };
}

/**
 * Snap a wall-mountable product (display, wall camera, etc.) to the nearest
 * valid wall surface, keeping it clear of door/window exclusion zones.
 */
export function snapWallMounted(
  room: RoomModel,
  product: EquipmentProduct,
  x: number,
  z: number,
  centerHeightM: number
): SnapResult {
  const wall = nearestWall(room, x, z);
  const halfWidth = (product.physical.width + DISPLAY_SIDE_CLEARANCE_M) / 2;
  const rawOffset = worldToWallOffset(room, wall, x, z);
  const { offset, clamped } = clampOffsetToClearSpan(room, wall, rawOffset, halfWidth);
  const inset = room.wallThickness + 0.03;
  const { x: sx, z: sz } = wallMountPoint(room, wall, offset, inset);

  const notes: string[] = [`Snapped to ${wall} wall`];
  if (clamped) notes.push('position adjusted to avoid door/window exclusion zone');

  return {
    position: { x: Number(sx.toFixed(3)), y: centerHeightM, z: Number(sz.toFixed(3)) },
    rotationY: presentationRotation(wall),
    wall,
    snapKind: 'wall',
    note: notes.join('; ')
  };
}

/** Snap ceiling-mounted equipment (speakers, ceiling mics) to ceiling height. */
export function snapCeilingMounted(room: RoomModel, x: number, z: number): SnapResult {
  const y = Number((room.height - CEILING_INSET_M).toFixed(3));
  return {
    position: { x: Number(x.toFixed(3)), y, z: Number(z.toFixed(3)) },
    rotationY: 0,
    snapKind: 'ceiling',
    note: `Snapped to ceiling (${y.toFixed(2)}m AFF)`
  };
}

/** Snap floor/table equipment to floor plane. */
export function snapFloorMounted(room: RoomModel, x: number, z: number, heightM: number): SnapResult {
  const y = Number((room.floorElevation + heightM / 2).toFixed(3));
  return {
    position: { x: Number(x.toFixed(3)), y, z: Number(z.toFixed(3)) },
    rotationY: 0,
    snapKind: 'floor',
    note: 'Snapped to floor'
  };
}

/**
 * Category-aware snap entry point used by transform gizmo and plan-view drag.
 * Respects product mounting capabilities from the catalog.
 */
export function snapEquipment(
  room: RoomModel,
  product: EquipmentProduct,
  position: { x: number; y: number; z: number },
  rotationY: number
): SnapResult {
  const mount = product.mounting;
  const category = product.category;

  if (category === 'display' || (mount?.wall && category === 'camera')) {
    return snapWallMounted(room, product, position.x, position.z, position.y);
  }

  if (product.speaker?.mount === 'ceiling' || product.microphone?.mount === 'ceiling') {
    return snapCeilingMounted(room, position.x, position.z);
  }

  if (product.microphone?.mount === 'table') {
    return snapFloorMounted(room, position.x, position.z, product.physical.height || 0.05);
  }

  // Default: preserve Y, snap to room centerlines if close (visible snap, not a new engine).
  let x = position.x;
  let z = position.z;
  const notes: string[] = [];
  if (Math.abs(x) <= 0.12) {
    x = 0;
    notes.push('room centerline X');
  }
  if (Math.abs(z) <= 0.12) {
    z = 0;
    notes.push('room centerline Z');
  }
  return {
    position: { x: Number(x.toFixed(3)), y: position.y, z: Number(z.toFixed(3)) },
    rotationY,
    snapKind: notes.length ? 'floor' : 'none',
    note: notes.length ? `Snapped to ${notes.join(', ')}` : 'No snap rule for this product type'
  };
}

/** Snap a seat/chair to a grid aligned to room center (0.1m increments). */
export function snapSeatPosition(x: number, z: number, gridM = 0.1): { x: number; z: number } {
  return {
    x: Math.round(x / gridM) * gridM,
    z: Math.round(z / gridM) * gridM
  };
}

/** Snap a table center to grid and keep the footprint inside the room. */
export function snapTablePosition(
  x: number,
  z: number,
  gridM = 0.05,
  room?: RoomModel,
  sizeX = 0,
  sizeZ = 0
): { x: number; z: number } {
  const snapped = snapSeatPosition(x, z, gridM);
  if (!room) return snapped;
  const hx = room.width / 2 - sizeX / 2 - 0.35;
  const hz = room.depth / 2 - sizeZ / 2 - 0.35;
  return {
    x: Number(Math.max(-hx, Math.min(hx, snapped.x)).toFixed(3)),
    z: Number(Math.max(-hz, Math.min(hz, snapped.z)).toFixed(3))
  };
}

/**
 * Returns true if a display footprint at the given wall offset would overlap
 * any door/window exclusion zone on that wall.
 */
export function displayOverlapsOpening(
  room: RoomModel,
  wall: WallKey,
  offsetAlongWall: number,
  displayWidthM: number
): boolean {
  const halfWidth = (displayWidthM + DISPLAY_SIDE_CLEARANCE_M) / 2;
  const start = offsetAlongWall - halfWidth;
  const end = offsetAlongWall + halfWidth;
  const candidate = computeWallCandidates(room, displayWidthM + DISPLAY_SIDE_CLEARANCE_M, 0).find((c) => c.wall === wall)!;
  for (const ob of candidate.obstacles) {
    if (start < ob.endOffsetM && ob.startOffsetM < end) return true;
  }
  return false;
}
