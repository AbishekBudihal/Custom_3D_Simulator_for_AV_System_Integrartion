/**
 * PortCompatibility.ts
 * Connection validity from catalog ports. No invented adapters.
 */

import type { EquipmentCatalog } from '../catalog/EquipmentCatalog';
import type { CompatibilityResult, PhysicalMedium, ResolvedPort, SystemConnection, TransportId } from './SystemTypes';
import { resolveInstancePorts } from './PortResolver';

export function portByIds(
  catalog: EquipmentCatalog,
  instanceId: string,
  productId: string,
  portId: string
): ResolvedPort | undefined {
  return resolveInstancePorts(instanceId, productId, catalog).find((p) => p.id === portId);
}

export function canConnectPorts(from: ResolvedPort, to: ResolvedPort): CompatibilityResult {
  if (from.instanceId === to.instanceId && from.id === to.id) {
    return { ok: false, code: 'SIGNAL-002', reason: 'A port cannot connect to itself.' };
  }
  if (from.instanceId === to.instanceId) {
    return { ok: false, code: 'SIGNAL-002', reason: 'Internal device routing is not drawn as a cable. Use the routing matrix.' };
  }
  const fromOut = from.direction === 'output' || from.direction === 'bidirectional';
  const toIn = to.direction === 'input' || to.direction === 'bidirectional';
  if (!fromOut || !toIn) {
    return {
      ok: false,
      code: 'SIGNAL-002',
      reason: `${from.direction.toUpperCase()} cannot connect to ${to.direction.toUpperCase()}.`
    };
  }
  const signals = from.signalTypes.filter((s) => to.signalTypes.includes(s));
  if (!signals.length) {
    return {
      ok: false,
      code: 'SIGNAL-003',
      reason: `${from.signalTypes.join('/')} output cannot connect to ${to.signalTypes.join('/')} input.`
    };
  }
  if (from.connector !== to.connector) {
    return {
      ok: false,
      code: 'SIGNAL-004',
      reason: `Connector mismatch: ${from.connector} cannot connect to ${to.connector}.`
    };
  }
  if (from.transport && to.transport && from.transport !== to.transport) {
    return {
      ok: false,
      code: 'SIGNAL-005',
      reason: `Unsupported transport: ${from.transport} cannot connect to ${to.transport}.`
    };
  }
  const transport: TransportId = from.transport ?? to.transport ?? inferTransport(from.connector);
  return {
    ok: true,
    signalType: signals[0],
    transport,
    physicalMedium: mediumFor(transport, from.connector)
  };
}

export function occupancyConflict(
  connections: SystemConnection[],
  fromInstanceId: string,
  fromPortId: string,
  toInstanceId: string,
  toPortId: string
): string | null {
  const srcBusy = connections.some((c) => c.fromInstanceId === fromInstanceId && c.fromPortId === fromPortId);
  const dstBusy = connections.some((c) => c.toInstanceId === toInstanceId && c.toPortId === toPortId);
  if (srcBusy) return 'Source port is already occupied.';
  if (dstBusy) return 'Destination port is already occupied.';
  return null;
}

export function duplicateConnection(
  connections: SystemConnection[],
  fromInstanceId: string,
  fromPortId: string,
  toInstanceId: string,
  toPortId: string
): boolean {
  return connections.some(
    (c) =>
      c.fromInstanceId === fromInstanceId &&
      c.fromPortId === fromPortId &&
      c.toInstanceId === toInstanceId &&
      c.toPortId === toPortId
  );
}

function inferTransport(connector: ResolvedPort['connector']): TransportId {
  switch (connector) {
    case 'hdmi':
      return 'hdmi';
    case 'displayport':
      return 'displayport';
    case 'usbc':
      return 'usb-c';
    case 'usb-a':
      return 'usb';
    case 'rj45':
      return 'ethernet';
    case 'xlr':
      return 'analog-mic';
    case 'line-trs':
      return 'analog-line';
    case 'phoenix':
    case 'speakon':
      return 'analog-speaker';
    default:
      return 'hdmi';
  }
}

function mediumFor(transport: TransportId, connector: ResolvedPort['connector']): PhysicalMedium {
  if (transport === 'hdmi-over-cat' || connector === 'rj45') return 'Cat6';
  if (connector === 'hdmi') return 'HDMI';
  if (connector === 'displayport') return 'DisplayPort';
  if (connector === 'usbc') return 'USB-C';
  if (connector === 'usb-a') return 'USB';
  if (connector === 'speakon' || connector === 'phoenix') return 'Speaker';
  return 'Audio';
}
