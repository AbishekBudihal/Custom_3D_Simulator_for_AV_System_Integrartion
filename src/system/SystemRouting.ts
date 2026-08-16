/**
 * SystemRouting.ts
 * Switcher/matrix routes are project state. Not inferred from room size.
 */

import type { EquipmentCatalog, EquipmentProduct } from '../catalog/EquipmentCatalog';
import type { ResolvedPort, SystemRoute } from './SystemTypes';
import { resolveInstancePorts } from './PortResolver';

export function isRoutableProduct(product: EquipmentProduct | undefined): boolean {
  return product?.category === 'switcher';
}

export function matrixPorts(instanceId: string, productId: string, catalog: EquipmentCatalog): {
  inputs: ResolvedPort[];
  outputs: ResolvedPort[];
} {
  const ports = resolveInstancePorts(instanceId, productId, catalog);
  return {
    inputs: ports.filter((p) => p.direction === 'input' || p.direction === 'bidirectional'),
    outputs: ports.filter((p) => p.direction === 'output' || p.direction === 'bidirectional')
  };
}

export function routeForOutput(routes: SystemRoute[], instanceId: string, outputPortId: string): SystemRoute | undefined {
  return routes.find((r) => r.instanceId === instanceId && r.outputPortId === outputPortId);
}

export function canForward(
  product: EquipmentProduct | undefined,
  routes: SystemRoute[],
  instanceId: string,
  incomingPortId: string,
  outgoingPortId: string
): boolean {
  if (!product) return false;
  if (!isRoutableProduct(product)) return true;
  return routes.some(
    (r) => r.instanceId === instanceId && r.inputPortId === incomingPortId && r.outputPortId === outgoingPortId
  );
}
