/**
 * PortResolver.ts
 * Ports come from catalog.ports, or from catalog.connectivity counts.
 * Never invent HDMI/USB/network that the catalog does not declare.
 */

import type { EquipmentCatalog, EquipmentProduct } from '../catalog/EquipmentCatalog';
import type { ConnectorId, PortDefinition, ResolvedPort, SignalType, TransportId } from './SystemTypes';

export function resolveProductPorts(product: EquipmentProduct): { ports: PortDefinition[]; origin: ResolvedPort['origin']; incomplete: boolean } {
  if (product.ports && product.ports.length > 0) {
    return { ports: product.ports, origin: 'catalog', incomplete: false };
  }
  const derived = deriveFromConnectivity(product);
  if (product.category === 'speaker' && product.speaker?.powerClass === 'passive' && !derived.some((p) => p.id === 'spk-in')) {
    derived.push({
      id: 'spk-in',
      label: 'SPEAKER IN',
      direction: 'input',
      signalTypes: ['AUDIO'],
      connector: 'phoenix',
      transport: 'analog-speaker',
      required: true
    });
  }
  if (derived.length > 0) {
    return { ports: derived, origin: product.ports?.length ? 'catalog' : 'connectivity', incomplete: false };
  }
  return { ports: [], origin: 'catalog', incomplete: true };
}

export function resolveInstancePorts(
  instanceId: string,
  productId: string,
  catalog: EquipmentCatalog
): ResolvedPort[] {
  const product = catalog.get(productId);
  if (!product) return [];
  const { ports, origin } = resolveProductPorts(product);
  return ports.map((p) => ({ ...p, instanceId, productId, origin }));
}

function deriveFromConnectivity(product: EquipmentProduct): PortDefinition[] {
  const c = product.connectivity;
  if (!c) return [];
  const ports: PortDefinition[] = [];
  const hdmi = c.hdmi ?? 0;
  for (let i = 1; i <= hdmi; i++) {
    ports.push(port(`hdmi-in-${i}`, `HDMI IN ${i}`, 'input', ['VIDEO'], 'hdmi', 'hdmi', product.category === 'display'));
  }
  const dp = c.displayPort ?? 0;
  for (let i = 1; i <= dp; i++) {
    ports.push(port(`dp-in-${i}`, `DP IN ${i}`, 'input', ['VIDEO'], 'displayport', 'displayport', false));
  }
  const usb = c.usb ?? 0;
  for (let i = 1; i <= usb; i++) {
    ports.push(port(`usb-${i}`, `USB ${i}`, 'bidirectional', ['USB'], 'usb-a', 'usb', false));
  }
  if (c.ethernet) {
    ports.push(port('net-1', 'NETWORK', 'bidirectional', ['NETWORK', 'CONTROL'], 'rj45', 'ethernet', false));
  }
  return ports;
}

function port(
  id: string,
  label: string,
  direction: PortDefinition['direction'],
  signalTypes: SignalType[],
  connector: ConnectorId,
  transport: TransportId,
  required: boolean
): PortDefinition {
  return { id, label, direction, signalTypes, connector, transport, required };
}

export function defaultForwarding(product: EquipmentProduct): SignalType[] {
  if (product.signalForwarding && product.signalForwarding.length) return product.signalForwarding;
  switch (product.category) {
    case 'switcher':
    case 'extender':
      return ['VIDEO', 'AUDIO'];
    case 'dsp':
      return ['AUDIO'];
    case 'amplifier':
      return ['AUDIO'];
    case 'network':
      return ['NETWORK', 'CONTROL'];
    default:
      return [];
  }
}
