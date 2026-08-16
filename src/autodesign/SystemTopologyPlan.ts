import type { EquipmentCatalog, EquipmentInstance, EquipmentProduct } from '../catalog/EquipmentCatalog';
import type { RoomModel } from '../room/RoomModel';
import type { SystemConnection, SystemRoute } from '../system/SystemTypes';
import { canConnectPorts, occupancyConflict } from '../system/PortCompatibility';
import { resolveInstancePorts, resolveProductPorts } from '../system/PortResolver';
import { isRoutableProduct } from '../system/SystemRouting';
import { firstConnectable, systemDeviceConnectable } from './CatalogCandidates';
import type { DesignRequirements } from './DesignRequirements';

export interface TopologyBuild {
  extraEquipment: EquipmentInstance[];
  connections: SystemConnection[];
  routes: SystemRoute[];
  notes: string[];
}

function inRoomRack(room: RoomModel, index: number, noRear: boolean): { x: number; y: number; z: number } {
  const inset = 0.55;
  const spread = 0.38 * index;
  if (noRear) {
    return {
      x: Number((-room.width / 2 + inset).toFixed(2)),
      y: 0.55,
      z: Number((-room.depth / 2 + 1.2 + spread).toFixed(2))
    };
  }
  return {
    x: Number((-room.width / 2 + inset + spread).toFixed(2)),
    y: 0.55,
    z: Number((room.depth / 2 - inset).toFixed(2))
  };
}

function mkInst(
  id: string,
  product: EquipmentProduct,
  room: RoomModel,
  index: number,
  noRear: boolean
): EquipmentInstance {
  return {
    instanceId: id,
    productId: product.id,
    name: `${product.manufacturer} ${product.model}`,
    position: inRoomRack(room, index, noRear),
    rotationY: 0,
    placementMode: 'smart',
    origin: 'auto'
  };
}

function connectPair(
  catalog: EquipmentCatalog,
  from: EquipmentInstance,
  to: EquipmentInstance,
  connections: SystemConnection[],
  notes: string[],
  id: string
): boolean {
  const fromPorts = resolveInstancePorts(from.instanceId, from.productId, catalog);
  const toPorts = resolveInstancePorts(to.instanceId, to.productId, catalog);
  if (!fromPorts.length || !toPorts.length) {
    notes.push(
      `DATA INCOMPLETE — cannot connect ${from.name} → ${to.name}: catalog ports missing (not invented).`
    );
    return false;
  }
  for (const a of fromPorts) {
    for (const b of toPorts) {
      const r = canConnectPorts(a, b);
      if (!r.ok) continue;
      if (occupancyConflict(connections, a.instanceId, a.id, b.instanceId, b.id)) continue;
      connections.push({
        id,
        fromInstanceId: from.instanceId,
        fromPortId: a.id,
        toInstanceId: to.instanceId,
        toPortId: b.id,
        signalType: r.signalType,
        transport: r.transport,
        physicalMedium: r.physicalMedium
      });
      return true;
    }
  }
  notes.push(`DATA INCOMPLETE — no compatible free ports between ${from.name} and ${to.name}.`);
  return false;
}

export function buildSystemTopology(input: {
  catalog: EquipmentCatalog;
  req: DesignRequirements;
  room: RoomModel;
  equipment: EquipmentInstance[];
  id: (prefix: string) => string;
  needVideoPath: boolean;
  needAudioPath: boolean;
  needSwitching: boolean;
  needDsp: boolean;
}): TopologyBuild {
  const notes: string[] = [];
  const extra: EquipmentInstance[] = [];
  const connections: SystemConnection[] = [];
  const routes: SystemRoute[] = [];
  const noRear = input.req.constraints.noRearWallEquipment;
  let rack = 0;

  const byCat = (cat: EquipmentProduct['category']) =>
    [...input.equipment, ...extra].filter((e) => input.catalog.get(e.productId)?.category === cat);

  if (input.needVideoPath) {
    let source = byCat('source')[0];
    if (!source) {
      const found = firstConnectable(input.catalog, 'source', input.req);
      if (found.product) {
        source = mkInst(input.id('src'), found.product, input.room, rack++, noRear);
        extra.push(source);
      } else notes.push(found.reason);
    }

    let switcher = byCat('switcher')[0];
    if (input.needSwitching && !switcher) {
      const found = firstConnectable(input.catalog, 'switcher', input.req);
      if (found.product) {
        switcher = mkInst(input.id('sw'), found.product, input.room, rack++, noRear);
        extra.push(switcher);
      } else notes.push(found.reason);
    }

    const displays = byCat('display');
    if (source && switcher) {
      connectPair(input.catalog, source, switcher, connections, notes, input.id('cx'));
      const swProduct = input.catalog.get(switcher.productId);
      const ports = resolveInstancePorts(switcher.instanceId, switcher.productId, input.catalog);
      const inputs = ports.filter((p) => p.direction === 'input' || p.direction === 'bidirectional');
      const outputs = ports.filter((p) => p.direction === 'output' || p.direction === 'bidirectional');
      if (displays[0]) {
        const ok = connectPair(input.catalog, switcher, displays[0], connections, notes, input.id('cx'));
        if (ok && isRoutableProduct(swProduct) && inputs[0] && outputs[0]) {
          routes.push({
            instanceId: switcher.instanceId,
            inputPortId: inputs[0].id,
            outputPortId: outputs[0].id
          });
        }
      }
      if (displays[1]) {
        notes.push(
          'DATA INCOMPLETE — catalog 2×1 switcher has a single HDMI output. A second display path was not invented (no distribution amplifier in catalog).'
        );
      }
    } else if (source && displays[0]) {
      connectPair(input.catalog, source, displays[0], connections, notes, input.id('cx'));
      if (displays[1]) {
        notes.push(
          'DATA INCOMPLETE — a second display has no catalog distribution path from the laptop HDMI output (port occupancy / connector).'
        );
      }
    }
  }

  if (input.needAudioPath) {
    let dsp = byCat('dsp')[0];
    if (input.needDsp && !dsp) {
      const found = firstConnectable(input.catalog, 'dsp', input.req);
      if (found.product) {
        dsp = mkInst(input.id('dsp'), found.product, input.room, rack++, noRear);
        extra.push(dsp);
      } else notes.push(found.reason);
    }

    const speakers = byCat('speaker');
    const needAmp = speakers.some((s) => input.catalog.get(s.productId)?.speaker?.powerClass === 'passive');
    const amps: EquipmentInstance[] = [...byCat('amplifier')];
    if (needAmp && amps.length === 0) {
      const found = firstConnectable(input.catalog, 'amplifier', input.req);
      if (found.product) {
        const amp = mkInst(input.id('amp'), found.product, input.room, rack++, noRear);
        extra.push(amp);
        amps.push(amp);
        const outs = resolveProductPorts(found.product).ports.filter((p) => p.direction === 'output');
        const speakerNeed = speakers.filter((s) => input.catalog.get(s.productId)?.speaker?.powerClass === 'passive').length;
        if (outs.length < speakerNeed) {
          const amp2 = mkInst(input.id('amp'), found.product, input.room, rack++, noRear);
          extra.push(amp2);
          amps.push(amp2);
          notes.push(
            `A second amplifier was added because catalog amp outputs (${outs.length}) are fewer than passive speakers (${speakerNeed}). Channel count comes from catalog ports, not seat count.`
          );
        }
      } else notes.push(found.reason);
    }

    if (dsp && amps[0]) connectPair(input.catalog, dsp, amps[0], connections, notes, input.id('cx'));
    if (dsp && amps[1]) connectPair(input.catalog, dsp, amps[1], connections, notes, input.id('cx'));

    let ampIndex = 0;
    for (const sp of speakers) {
      const product = input.catalog.get(sp.productId);
      if (product?.speaker?.powerClass === 'active') {
        if (dsp) connectPair(input.catalog, dsp, sp, connections, notes, input.id('cx'));
        continue;
      }
      const amp = amps[ampIndex] ?? amps[amps.length - 1];
      if (!amp) {
        notes.push(`DATA INCOMPLETE — passive speaker ${sp.name} has no amplifier path.`);
        continue;
      }
      const before = connections.length;
      connectPair(input.catalog, amp, sp, connections, notes, input.id('cx'));
      if (connections.length === before) ampIndex++;
      else {
        const ampPorts = resolveInstancePorts(amp.instanceId, amp.productId, input.catalog).filter(
          (p) => p.direction === 'output'
        );
        const used = connections.filter((c) => c.fromInstanceId === amp.instanceId).length;
        if (used >= ampPorts.length) ampIndex++;
      }
    }

    for (const mic of byCat('microphone')) {
      const miss = systemDeviceConnectable(input.catalog.get(mic.productId)!);
      if (miss) {
        notes.push(`Microphone ${mic.name}: ${miss} Dante/analog I/O was not invented.`);
      } else if (dsp) {
        connectPair(input.catalog, mic, dsp, connections, notes, input.id('cx'));
      }
    }
  }

  if (input.req.system.controlRequired) {
    const foundSw = firstConnectable(input.catalog, 'network', input.req);
    const foundTp = firstConnectable(input.catalog, 'control', input.req);
    if (foundSw.product && foundTp.product) {
      const net = mkInst(input.id('net'), foundSw.product, input.room, rack++, noRear);
      const tp = mkInst(input.id('ctl'), foundTp.product, input.room, rack++, noRear);
      extra.push(net, tp);
      connectPair(input.catalog, tp, net, connections, notes, input.id('cx'));
    } else {
      notes.push(foundSw.reason);
      notes.push(foundTp.reason);
    }
  }

  for (const cam of byCat('camera')) {
    const miss = systemDeviceConnectable(input.catalog.get(cam.productId)!);
    if (miss) notes.push(`Camera ${cam.name}: ${miss}`);
  }

  return { extraEquipment: extra, connections, routes, notes };
}
