/**
 * Spatial checks on generated project geometry. Uses room bounds and
 * SnapEngine door/window exclusion — not renderer offsets.
 */

import type { EquipmentCatalog, EquipmentInstance } from '../catalog/EquipmentCatalog';
import type { RoomModel } from '../room/RoomModel';
import type { Seat, TableSpec } from '../room/SeatingGenerator';
import { worldToWallOffset, type WallKey } from '../room/RoomGeometry';
import { displayOverlapsOpening } from '../interaction/SnapEngine';
import { resolveInstancePorts } from '../system/PortResolver';
import type { SystemConnection } from '../system/SystemTypes';

export interface SpatialIssue {
  code: string;
  message: string;
}

export function insideRoomXZ(room: RoomModel, x: number, z: number, margin = 0.02): boolean {
  return Math.abs(x) <= room.width / 2 - margin && Math.abs(z) <= room.depth / 2 - margin;
}

export function clampInsideRoom(room: RoomModel, x: number, z: number, margin = 0.35): { x: number; z: number } {
  const hx = room.width / 2 - margin;
  const hz = room.depth / 2 - margin;
  return {
    x: Number(Math.max(-hx, Math.min(hx, x)).toFixed(2)),
    z: Number(Math.max(-hz, Math.min(hz, z)).toFixed(2))
  };
}

export function auditGeneratedLayout(input: {
  room: RoomModel;
  seats: Seat[];
  tables: TableSpec[];
  equipment: EquipmentInstance[];
  connections: SystemConnection[];
  catalog: EquipmentCatalog;
}): SpatialIssue[] {
  const issues: SpatialIssue[] = [];
  const { room } = input;

  for (const s of input.seats) {
    if (!insideRoomXZ(room, s.x, s.z, 0.05)) {
      issues.push({ code: 'SPATIAL-SEAT', message: `Seat ${s.id} is outside the room bounds.` });
    }
  }
  for (const t of input.tables) {
    const hx = t.sizeX / 2;
    const hz = t.sizeZ / 2;
    if (
      !insideRoomXZ(room, t.centerX - hx, t.centerZ - hz, 0) ||
      !insideRoomXZ(room, t.centerX + hx, t.centerZ + hz, 0)
    ) {
      issues.push({ code: 'SPATIAL-TABLE', message: `Table ${t.id} extends outside the room.` });
    }
  }
  for (const e of input.equipment) {
    const y = e.position.y;
    if (y < -0.05 || y > room.height + 0.05) {
      issues.push({ code: 'SPATIAL-Y', message: `${e.name} height ${y} m is outside the room.` });
    }
    if (!insideRoomXZ(room, e.position.x, e.position.z, 0.005)) {
      issues.push({ code: 'SPATIAL-EQ', message: `${e.name} is outside the room bounds.` });
    }
    const product = input.catalog.get(e.productId);
    if (product?.category === 'display' && e.wall) {
      const offset = worldToWallOffset(room, e.wall as WallKey, e.position.x, e.position.z);
      if (displayOverlapsOpening(room, e.wall as WallKey, offset, product.physical.width)) {
        issues.push({ code: 'SPATIAL-DOOR', message: `${e.name} overlaps a door or window exclusion zone.` });
      }
    }
  }
  const ids = new Set(input.equipment.map((e) => e.instanceId));
  for (const c of input.connections) {
    if (!ids.has(c.fromInstanceId) || !ids.has(c.toInstanceId)) {
      issues.push({ code: 'TOPO-ORPHAN', message: `Connection ${c.id} references a missing device.` });
      continue;
    }
    const from = input.equipment.find((e) => e.instanceId === c.fromInstanceId)!;
    const to = input.equipment.find((e) => e.instanceId === c.toInstanceId)!;
    const fp = resolveInstancePorts(from.instanceId, from.productId, input.catalog);
    const tp = resolveInstancePorts(to.instanceId, to.productId, input.catalog);
    if (!fp.some((p) => p.id === c.fromPortId) || !tp.some((p) => p.id === c.toPortId)) {
      issues.push({ code: 'TOPO-PORT', message: `Connection ${c.id} uses a port that is not in the catalog.` });
    }
  }
  return issues;
}
