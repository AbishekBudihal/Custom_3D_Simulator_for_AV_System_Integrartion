/**
 * CableEngine.ts
 * Rebuilds the prototype's cable-routing concept as an independent,
 * testable module (§18). Routes each endpoint to a head-end (AV
 * rack) via an estimated ceiling path, applies service-loop slack,
 * and classifies the cable type/connector against real-world run
 * distance limits.
 */

export type EndpointType = 'display' | 'speaker' | 'microphone' | 'camera';

export interface CableEndpoint {
  id: string;
  type: EndpointType;
  label: string;
  x: number;
  y: number;
  z: number;
  /** For microphones: whether it's a networked (Dante/AVoIP) device */
  networked?: boolean;
}

export interface RackLocation {
  x: number;
  y: number; // cable entry height into the rack
  z: number;
}

export interface CableClass {
  id: string;
  label: string;
  connector: string;
  maxRunM: number;
}

export const CABLE_CLASSES: Record<string, CableClass> = {
  hdmi: { id: 'hdmi', label: 'HDMI 2.1 (passive)', connector: 'HDMI', maxRunM: 5 },
  hdbaset: { id: 'hdbaset', label: 'HDBaseT over Cat6a', connector: 'RJ45 (extender)', maxRunM: 100 },
  speakerLow: { id: 'speakerLow', label: '16 AWG speaker cable (8 ohm)', connector: 'Terminal block', maxRunM: 30 },
  speaker70v: { id: 'speaker70v', label: '70V/100V constant-voltage line', connector: 'Terminal block', maxRunM: 300 },
  networkAv: { id: 'networkAv', label: 'Cat6 shielded (Dante/PoE/AVoIP)', connector: 'RJ45 (shielded)', maxRunM: 100 },
  micAnalog: { id: 'micAnalog', label: 'Shielded microphone cable', connector: 'Phoenix / XLR', maxRunM: 30 }
};

function classifyEndpoint(endpoint: CableEndpoint, lengthM: number): CableClass {
  switch (endpoint.type) {
    case 'display':
      return lengthM <= CABLE_CLASSES.hdmi.maxRunM ? CABLE_CLASSES.hdmi : CABLE_CLASSES.hdbaset;
    case 'speaker':
      return lengthM <= CABLE_CLASSES.speakerLow.maxRunM ? CABLE_CLASSES.speakerLow : CABLE_CLASSES.speaker70v;
    case 'microphone':
      return endpoint.networked ? CABLE_CLASSES.networkAv : CABLE_CLASSES.micAnalog;
    case 'camera':
      return CABLE_CLASSES.networkAv;
  }
}

export interface CableRoute {
  endpointId: string;
  endpointLabel: string;
  endpointType: EndpointType;
  estimatedLengthM: number;
  cableClass: CableClass;
  withinLimit: boolean;
  path: { x: number; y: number; z: number }[];
}

export interface CableEngineOptions {
  ceilingHeightM: number;
  serviceLoopFactor?: number; // default 1.15 (15% slack)
}

export function computeCableRoute(
  endpoint: CableEndpoint,
  rack: RackLocation,
  opts: CableEngineOptions
): CableRoute {
  const slack = opts.serviceLoopFactor ?? 1.15;
  const ceilingY = opts.ceilingHeightM - 0.1;

  const upRun = Math.max(ceilingY - endpoint.y, 0);
  const acrossRun = Math.hypot(endpoint.x - rack.x, endpoint.z - rack.z);
  const downRun = Math.max(ceilingY - rack.y, 0);
  const rawLength = upRun + acrossRun + downRun;
  const lengthM = Number((rawLength * slack).toFixed(1));

  const cableClass = classifyEndpoint(endpoint, lengthM);

  return {
    endpointId: endpoint.id,
    endpointLabel: endpoint.label,
    endpointType: endpoint.type,
    estimatedLengthM: lengthM,
    cableClass,
    withinLimit: lengthM <= cableClass.maxRunM,
    path: [
      { x: endpoint.x, y: endpoint.y, z: endpoint.z },
      { x: endpoint.x, y: ceilingY, z: endpoint.z },
      { x: rack.x, y: ceilingY, z: rack.z },
      { x: rack.x, y: rack.y, z: rack.z }
    ]
  };
}

export interface CableSchedule {
  routes: CableRoute[];
  totalLengthM: number;
  totalsByClass: Record<string, number>;
  violations: CableRoute[];
}

export function computeCableSchedule(
  endpoints: CableEndpoint[],
  rack: RackLocation,
  opts: CableEngineOptions
): CableSchedule {
  const routes = endpoints.map((e) => computeCableRoute(e, rack, opts));
  const totalLengthM = Number(routes.reduce((s, r) => s + r.estimatedLengthM, 0).toFixed(1));
  const totalsByClass: Record<string, number> = {};
  routes.forEach((r) => {
    totalsByClass[r.cableClass.label] = Number(((totalsByClass[r.cableClass.label] ?? 0) + r.estimatedLengthM).toFixed(1));
  });
  return {
    routes,
    totalLengthM,
    totalsByClass,
    violations: routes.filter((r) => !r.withinLimit)
  };
}
