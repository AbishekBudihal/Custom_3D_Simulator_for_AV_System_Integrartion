/**
 * Interactive placement notes. Geometric only — not a second validation engine.
 */

import type { EquipmentProduct } from '../catalog/EquipmentCatalog';
import type { RoomModel } from '../room/RoomModel';
import type { TableSpec } from '../room/SeatingGenerator';
import { displayIntersectsOpeningClearance, displayNearOpening } from './placement/PlacementCandidateEngine';

export interface PlacementNote {
  status: 'valid' | 'warning' | 'invalid';
  note: string;
}

export function exclusiveCeiling(product: EquipmentProduct): boolean {
  if (product.speaker?.mount === 'ceiling' || product.microphone?.mount === 'ceiling') return true;
  return !!product.mounting?.ceiling && !product.mounting.wall && !product.mounting.floor;
}

export function exclusiveWall(product: EquipmentProduct): boolean {
  if (product.category === 'display') return true;
  if (product.camera?.mount === 'wall') return true;
  return !!product.mounting?.wall && !product.mounting.ceiling && !product.mounting.floor;
}

export function exclusiveTable(product: EquipmentProduct): boolean {
  if (product.microphone?.mount === 'table' || product.camera?.mount === 'table') return true;
  return !!product.mounting?.table && !product.mounting.wall && !product.mounting.ceiling && !product.mounting.floor;
}

export function exclusiveFloor(product: EquipmentProduct): boolean {
  return !!product.mounting?.floor && !product.mounting.wall && !product.mounting.ceiling;
}

export function evaluatePlacement(
  room: RoomModel | null,
  tables: TableSpec[],
  product: EquipmentProduct,
  position: { x: number; y: number; z: number }
): PlacementNote {
  if (!room) return { status: 'warning', note: 'No room defined' };
  const hw = room.width / 2;
  const hd = room.depth / 2;
  const margin = 0.08;
  if (Math.abs(position.x) > hw - margin || Math.abs(position.z) > hd - margin) {
    return { status: 'warning', note: '⚠ Outside usable room area' };
  }
  if (position.y < 0.02 || position.y > room.height + 0.05) {
    return { status: 'warning', note: '⚠ Height is outside the room' };
  }
  if (exclusiveCeiling(product) && position.y < room.height - 0.45) {
    return { status: 'warning', note: '⚠ Ceiling-only device is not at ceiling height' };
  }
  if (exclusiveWall(product) && Math.abs(position.y) < 0.2) {
    return { status: 'warning', note: '⚠ Wall-mounted device is at floor height' };
  }
  if (exclusiveFloor(product) && position.y > 0.6) {
    return { status: 'warning', note: '⚠ Floor-only device is not near the floor' };
  }
  if (exclusiveWall(product)) {
    const nearWall =
      Math.abs(Math.abs(position.x) - room.width / 2) < 0.55 || Math.abs(Math.abs(position.z) - room.depth / 2) < 0.55;
    if (!nearWall) {
      return { status: 'warning', note: '⚠ Wall-mounted device is not on a wall' };
    }
  }
  if (product.category === 'display' && displayIntersectsOpeningClearance(room, position)) {
    return { status: 'invalid', note: '✕ Intersects door clearance' };
  }
  if (product.category === 'display' && displayNearOpening(room, position, 'door', 0.45)) {
    return { status: 'warning', note: '⚠ Near door circulation' };
  }
  if (product.category === 'display' && displayNearOpening(room, position, 'window', 0.2)) {
    return { status: 'warning', note: '⚠ Near window — glare risk' };
  }
  const tableHit = tables.find((t) => {
    const hx = t.sizeX / 2;
    const hz = t.sizeZ / 2;
    return (
      position.x >= t.centerX - hx &&
      position.x <= t.centerX + hx &&
      position.z >= t.centerZ - hz &&
      position.z <= t.centerZ + hz &&
      position.y < (t.height ?? 0.75) + 0.15
    );
  });
  if (tableHit && product.microphone?.mount !== 'table') {
    return { status: 'warning', note: '⚠ Intersects furniture' };
  }
  const wallClear = 0.25;
  if (
    product.category !== 'display' &&
    (Math.abs(position.x) > hw - wallClear || Math.abs(position.z) > hd - wallClear) &&
    !exclusiveWall(product)
  ) {
    return { status: 'warning', note: '⚠ Insufficient wall clearance' };
  }
  return { status: 'valid', note: '✓ Valid placement' };
}
