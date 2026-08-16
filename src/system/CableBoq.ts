/**
 * Future BOQ input. No pricing, vendors, or procurement.
 */

import type { EquipmentInstance } from '../catalog/EquipmentCatalog';
import type { PhysicalMedium, SystemConnection } from './SystemTypes';
import { cachedCableRoute, type CableRouteContext } from './CableRouter';

export interface CableBoqLine {
  cableType: PhysicalMedium;
  quantity: number;
  estimatedTotalLengthM: number;
  connections: Array<{
    id: string;
    sourceInstanceId: string;
    destinationInstanceId: string;
    estimatedLengthM: number;
  }>;
}

export function cableTypeOf(c: SystemConnection): PhysicalMedium {
  return c.cableType ?? c.physicalMedium;
}

export function cableBoqFromConnections(connections: SystemConnection[], ctx: CableRouteContext): CableBoqLine[] {
  const byType = new Map<PhysicalMedium, CableBoqLine>();
  connections.forEach((c) => {
    const type = cableTypeOf(c);
    const route = cachedCableRoute(c, ctx);
    const line =
      byType.get(type) ??
      ({
        cableType: type,
        quantity: 0,
        estimatedTotalLengthM: 0,
        connections: []
      } satisfies CableBoqLine);
    line.quantity += 1;
    line.estimatedTotalLengthM = Number((line.estimatedTotalLengthM + route.totalLength).toFixed(3));
    const src = ctx.equipment.find((e) => e.instanceId === c.fromInstanceId);
    const dst = ctx.equipment.find((e) => e.instanceId === c.toInstanceId);
    line.connections.push({
      id: c.id,
      sourceInstanceId: src?.instanceId ?? c.fromInstanceId,
      destinationInstanceId: dst?.instanceId ?? c.toInstanceId,
      estimatedLengthM: route.totalLength
    });
    byType.set(type, line);
  });
  return Array.from(byType.values());
}

export function deviceLabel(equipment: EquipmentInstance[], id: string): string {
  return equipment.find((e) => e.instanceId === id)?.name ?? id;
}
