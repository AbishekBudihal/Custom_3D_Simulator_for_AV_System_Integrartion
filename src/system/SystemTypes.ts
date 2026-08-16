/**
 * SystemTypes.ts
 * Device → Port → Connection graph. Not spatial simulation.
 * Catalog describes capability; project instances + connections describe the design.
 */

export type SignalType = 'VIDEO' | 'AUDIO' | 'USB' | 'NETWORK' | 'CONTROL' | 'POWER';
export type PortDirection = 'input' | 'output' | 'bidirectional';
export type ConnectorId =
  | 'hdmi'
  | 'displayport'
  | 'usbc'
  | 'usb-a'
  | 'rj45'
  | 'xlr'
  | 'line-trs'
  | 'phoenix'
  | 'speakon';
export type TransportId =
  | 'hdmi'
  | 'displayport'
  | 'usb'
  | 'usb-c'
  | 'hdmi-over-cat'
  | 'analog-line'
  | 'analog-mic'
  | 'analog-speaker'
  | 'ethernet';
export type PhysicalMedium = 'HDMI' | 'DisplayPort' | 'USB' | 'USB-C' | 'Cat6' | 'Audio' | 'Speaker';

export interface PortDefinition {
  id: string;
  label: string;
  direction: PortDirection;
  signalTypes: SignalType[];
  connector: ConnectorId;
  transport?: TransportId;
  required?: boolean;
  /** Catalog note, e.g. PoE. Never invent electrical ratings. */
  capabilities?: string[];
}

export interface ResolvedPort extends PortDefinition {
  instanceId: string;
  productId: string;
  origin: 'catalog' | 'connectivity';
}

export interface SystemConnection {
  id: string;
  fromInstanceId: string;
  fromPortId: string;
  toInstanceId: string;
  toPortId: string;
  signalType: SignalType;
  transport: TransportId;
  physicalMedium: PhysicalMedium;
}

export type CompatibilityOk = {
  ok: true;
  signalType: SignalType;
  transport: TransportId;
  physicalMedium: PhysicalMedium;
};

export type CompatibilityFail = {
  ok: false;
  reason: string;
  code: 'SIGNAL-002' | 'SIGNAL-003' | 'SIGNAL-004' | 'SIGNAL-005' | 'SIGNAL-006';
};

export type CompatibilityResult = CompatibilityOk | CompatibilityFail;

export interface SignalPathHop {
  instanceId: string;
  portId: string;
  productId: string;
}

export interface SignalPath {
  id: string;
  signalType: SignalType;
  hops: SignalPathHop[];
  connectionIds: string[];
  complete: boolean;
  breakReason?: string;
}

export interface SystemRoute {
  instanceId: string;
  inputPortId: string;
  outputPortId: string;
}

export interface SystemGroup {
  id: string;
  name: string;
  memberIds: string[];
  collapsed: boolean;
}

export const SYSTEM_ROLE_CATEGORIES = [
  'source',
  'switcher',
  'extender',
  'dsp',
  'amplifier',
  'control',
  'network',
  'codec'
] as const;
