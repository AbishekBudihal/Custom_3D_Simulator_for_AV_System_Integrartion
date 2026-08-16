/**
 * SignalPathEngine.ts
 * Walks the connection graph. Switchers only forward along catalog routes.
 */

import type { EquipmentCatalog } from '../catalog/EquipmentCatalog';
import type { SignalPath, SignalType, SystemConnection, SystemRoute } from './SystemTypes';
import { defaultForwarding, resolveInstancePorts } from './PortResolver';
import { canForward, isRoutableProduct } from './SystemRouting';

export function enumerateSignalPaths(
  equipment: Array<{ instanceId: string; productId: string }>,
  connections: SystemConnection[],
  catalog: EquipmentCatalog,
  routes: SystemRoute[] = []
): SignalPath[] {
  const paths: SignalPath[] = [];
  let n = 0;
  for (const inst of equipment) {
    const ports = resolveInstancePorts(inst.instanceId, inst.productId, catalog);
    for (const port of ports) {
      if (port.direction !== 'output' && port.direction !== 'bidirectional') continue;
      const outgoing = connections.filter((c) => c.fromInstanceId === inst.instanceId && c.fromPortId === port.id);
      for (const start of outgoing) {
        const walked = walk(start, equipment, connections, catalog, routes, start.signalType, new Set());
        if (walked.hops.length < 2) continue;
        n += 1;
        paths.push({
          id: `path-${n}`,
          signalType: start.signalType,
          hops: walked.hops,
          connectionIds: connectionIdsAlong(walked.hops, connections),
          complete: walked.complete,
          breakReason: walked.breakReason
        });
      }
    }
  }
  return paths;
}

function walk(
  start: SystemConnection,
  equipment: Array<{ instanceId: string; productId: string }>,
  connections: SystemConnection[],
  catalog: EquipmentCatalog,
  routes: SystemRoute[],
  signal: SignalType,
  visited: Set<string>
): { hops: SignalPath['hops']; complete: boolean; breakReason?: string } {
  const key = start.id;
  if (visited.has(key)) return { hops: [], complete: false, breakReason: 'Cycle detected.' };
  visited.add(key);
  const fromProd = equipment.find((e) => e.instanceId === start.fromInstanceId);
  const toProd = equipment.find((e) => e.instanceId === start.toInstanceId);
  if (!fromProd || !toProd) return { hops: [], complete: false, breakReason: 'Missing device on connection.' };
  const hops: SignalPath['hops'] = [
    { instanceId: start.fromInstanceId, portId: start.fromPortId, productId: fromProd.productId },
    { instanceId: start.toInstanceId, portId: start.toPortId, productId: toProd.productId }
  ];
  const toProduct = catalog.get(toProd.productId);
  if (!toProduct) return { hops, complete: false, breakReason: 'DATA INCOMPLETE — unknown catalog item.' };
  const forwarding = defaultForwarding(toProduct);
  if (!forwarding.includes(signal)) {
    return { hops, complete: true };
  }
  const next = connections.filter((c) => {
    if (c.fromInstanceId !== start.toInstanceId || c.signalType !== signal) return false;
    return canForward(toProduct, routes, start.toInstanceId, start.toPortId, c.fromPortId);
  });
  if (!next.length) {
    if (isRoutableProduct(toProduct) && !routes.some((r) => r.instanceId === start.toInstanceId && r.inputPortId === start.toPortId)) {
      return {
        hops,
        complete: false,
        breakReason: `${toProd.instanceId} has no matrix route from the incoming port.`
      };
    }
    const outs = resolveInstancePorts(toProd.instanceId, toProd.productId, catalog).filter(
      (p) => p.direction === 'output' || p.direction === 'bidirectional'
    );
    if (outs.length) {
      return { hops, complete: false, breakReason: `No outgoing ${signal} connection from this device.` };
    }
    return { hops, complete: true };
  }
  const rest = walk(next[0], equipment, connections, catalog, routes, signal, visited);
  return {
    hops: hops.concat(rest.hops.slice(1)),
    complete: rest.complete,
    breakReason: rest.breakReason
  };
}

function connectionIdsAlong(hops: SignalPath['hops'], connections: SystemConnection[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < hops.length - 1; i++) {
    const a = hops[i];
    const b = hops[i + 1];
    const c = connections.find(
      (x) =>
        x.fromInstanceId === a.instanceId &&
        x.fromPortId === a.portId &&
        x.toInstanceId === b.instanceId &&
        x.toPortId === b.portId
    );
    if (c) ids.push(c.id);
  }
  return ids;
}

export function pathLabel(path: SignalPath, equipment: Array<{ instanceId: string; name: string }>): string {
  const names: string[] = [];
  for (const h of path.hops) {
    const name = equipment.find((e) => e.instanceId === h.instanceId)?.name ?? h.instanceId;
    if (names[names.length - 1] !== name) names.push(name);
  }
  return names.join(' → ');
}

export function describePath(
  path: SignalPath,
  equipment: Array<{ instanceId: string; name: string }>,
  connections: SystemConnection[]
): Array<{ kind: 'device' | 'cable'; text: string }> {
  const rows: Array<{ kind: 'device' | 'cable'; text: string }> = [];
  path.hops.forEach((h, i) => {
    const name = equipment.find((e) => e.instanceId === h.instanceId)?.name ?? h.instanceId;
    if (i === 0 || path.hops[i - 1].instanceId !== h.instanceId) {
      rows.push({ kind: 'device', text: name });
    }
    if (i < path.hops.length - 1 && path.hops[i].instanceId !== path.hops[i + 1].instanceId) {
      const cx = connections.find(
        (c) =>
          c.fromInstanceId === h.instanceId &&
          c.fromPortId === h.portId &&
          c.toInstanceId === path.hops[i + 1].instanceId &&
          c.toPortId === path.hops[i + 1].portId
      );
      rows.push({
        kind: 'cable',
        text: cx ? `${cx.physicalMedium} (${cx.signalType})` : path.signalType
      });
    }
  });
  return rows;
}
