import { describe, it, expect } from 'vitest';
import { AppState } from '../../src/app/AppState';
import { loadDefaultCatalog } from '../../src/catalog/loadCatalog';
import { canConnectPorts, canConnectWithCable } from '../../src/system/PortCompatibility';
import { resolveInstancePorts } from '../../src/system/PortResolver';
import {
  cachedCableRoute,
  portWorldPosition,
  routeForConnection,
  segmentHitsObstacles,
  routingObstacles,
  xzSegmentHitsBox
} from '../../src/system/CableRouter';
import { cableRouteContext } from '../../src/system/cableContext';
import { cableBoqFromConnections, cableTypeOf } from '../../src/system/CableBoq';
import { runDesignValidation } from '../../src/av/validation/DesignValidationEngine';
import { inspectSeat } from '../../src/av/SeatInspection';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { defaultFloorRack } from '../../src/av/AVRack';
import { overlayLayerForFinding } from '../../src/av/simulation/AnalysisLayer';

const catalog = loadDefaultCatalog();

function place(state: AppState, productId: string, instanceId: string, x = 0, z = 0, y = 1): void {
  const p = catalog.get(productId)!;
  state.addEquipment({
    instanceId,
    productId,
    name: p.model,
    position: { x, y, z },
    rotationY: 0
  });
}

describe('Ports', () => {
  it('accepts HDMI out to HDMI in', () => {
    const from = resolveInstancePorts('a', 'user-laptop-source', catalog).find((p) => p.id === 'hdmi-out')!;
    const to = resolveInstancePorts('b', 'lg-86uh5j', catalog).find((p) => p.id === 'hdmi-in-1')!;
    expect(canConnectPorts(from, to).ok).toBe(true);
  });

  it('rejects HDMI out to analog audio in', () => {
    const from = resolveInstancePorts('a', 'user-laptop-source', catalog).find((p) => p.id === 'hdmi-out')!;
    const to = resolveInstancePorts('b', 'user-dsp-4ch', catalog).find((p) => p.id === 'line-in-1')!;
    expect(canConnectPorts(from, to).ok).toBe(false);
  });

  it('rejects a cable type that is not the catalog medium', () => {
    const from = resolveInstancePorts('a', 'user-laptop-source', catalog).find((p) => p.id === 'hdmi-out')!;
    const to = resolveInstancePorts('b', 'lg-86uh5j', catalog).find((p) => p.id === 'hdmi-in-1')!;
    const r = canConnectWithCable(from, to, 'XLR');
    expect(r.ok).toBe(false);
  });

  it('reports missing catalog ports', () => {
    const state = new AppState();
    place(state, 'lg-86uh5j', 'disp');
    expect(state.addConnection('disp', 'no-such-port', 'disp', 'hdmi-in-1')).toBe(false);
    expect(state.lastSystemError).toMatch(/DATA INCOMPLETE|missing/i);
  });
});

describe('Connections', () => {
  it('creates and removes an explicit connection with signal type', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'lg-86uh5j', 'disp');
    expect(state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1')).toBe(true);
    expect(state.connections[0].fromInstanceId).toBe('src');
    expect(state.connections[0].toInstanceId).toBe('disp');
    expect(state.connections[0].signalType).toBe('VIDEO');
    expect(cableTypeOf(state.connections[0])).toBe('HDMI');
    state.removeConnection(state.connections[0].id);
    expect(state.connections.length).toBe(0);
  });
});

describe('Cable routes', () => {
  it('uses polyline length, not a single Euclidean hop', () => {
    const state = new AppState();
    state.setRoom({ ...createDefaultRoom('conference'), width: 10, depth: 8, height: 3, openings: [], columns: [] });
    place(state, 'user-laptop-source', 'src', -3, 2, 1);
    place(state, 'lg-86uh5j', 'disp', 0, -3.5, 1.6);
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    const ctx = cableRouteContext(state, catalog);
    const route = routeForConnection(state.connections[0], ctx);
    expect(route.segments.length).toBeGreaterThan(1);
    const euclid = Math.hypot(-3 - 0, 1 - 1.6, 2 - -3.5);
    expect(route.totalLength).toBeGreaterThan(euclid);
  });

  it('does not take a table-height straight line through furniture', () => {
    const state = new AppState();
    state.setRoom({ ...createDefaultRoom('conference'), width: 10, depth: 8, height: 3, openings: [], columns: [] });
    state.tables = [{ id: 't1', centerX: 0, centerZ: 0, sizeX: 3, sizeZ: 1.2, height: 0.75, thickness: 0.04, shape: 'rect' }];
    place(state, 'user-laptop-source', 'src', -3, 0, 0.9);
    place(state, 'lg-86uh5j', 'disp', 3, 0, 1.6);
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    const ctx = cableRouteContext(state, catalog);
    const route = cachedCableRoute(state.connections[0], ctx);
    const boxes = routingObstacles(state.room, state.tables, state.seats, state.racks, new Set());
    const table = boxes.find((b) => b.id === 'table:t1')!;
    expect(xzSegmentHitsBox(-3, 0, 3, 0, table)).toBe(true);
    const lowHits = route.segments.flatMap((s) => {
      const y = Math.min(s.start.y, s.end.y);
      if (y > 0.8) return [];
      return segmentHitsObstacles(s.start, s.end, boxes);
    });
    expect(lowHits.filter((id) => id.startsWith('table:')).length).toBe(0);
    expect(route.status === 'clear' || route.intersectingObstacleIds.every((id) => !id.startsWith('table:'))).toBe(true);
  });

  it('routes a rack-mounted destination to the rack, not a duplicate object', () => {
    const state = new AppState();
    state.setRoom({ ...createDefaultRoom('conference'), width: 10, depth: 8, height: 3, openings: [], columns: [] });
    const rack = { ...defaultFloorRack(), x: 4, z: 3 };
    state.setRacks([rack]);
    place(state, 'user-touch-controller', 'tp', -2, 0, 1.1);
    place(state, 'user-net-switch-8', 'sw', 0, 0, 0.5);
    state.assignEquipmentToRack('sw', rack.id, 1);
    expect(state.addConnection('tp', 'net-1', 'sw', 'p1')).toBe(true);
    const sw = state.equipment.find((e) => e.instanceId === 'sw')!;
    const port = resolveInstancePorts('sw', sw.productId, catalog).find((p) => p.id === 'p1');
    const world = portWorldPosition(sw, port, state.racks);
    expect(Math.abs(world.x - rack.x)).toBeLessThan(0.5);
    expect(Math.abs(world.z - rack.z)).toBeLessThan(0.6);
    const route = cachedCableRoute(state.connections[0], cableRouteContext(state, catalog));
    const last = route.segments[route.segments.length - 1];
    expect(Math.hypot(last.end.x - world.x, last.end.z - world.z)).toBeLessThan(0.05);
  });

  it('invalidates length when a device moves', () => {
    const state = new AppState();
    state.setRoom({ ...createDefaultRoom('conference'), width: 10, depth: 8, height: 3, openings: [], columns: [] });
    place(state, 'user-laptop-source', 'src', -1, 1, 1);
    place(state, 'lg-86uh5j', 'disp', 1, -2, 1.6);
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    const a = cachedCableRoute(state.connections[0], cableRouteContext(state, catalog)).totalLength;
    state.updateEquipment('src', { position: { x: -4, y: 1, z: 3 } });
    const b = cachedCableRoute(state.connections[0], cableRouteContext(state, catalog)).totalLength;
    expect(b).not.toBe(a);
  });

  it('does not invent an HDMI length limit', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'lg-86uh5j', 'disp');
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    const report = runDesignValidation({
      room: state.room,
      seats: [],
      tables: [],
      equipment: state.equipment,
      connections: state.connections,
      catalog
    });
    expect(report.findings.some((f) => f.code === 'CABLE-002')).toBe(false);
    state.setCableLengthLimit('HDMI', 0.01);
    const limited = runDesignValidation({
      room: { ...createDefaultRoom('conference'), width: 10, depth: 8, height: 3, openings: [], columns: [] },
      seats: [],
      tables: [],
      equipment: state.equipment,
      connections: state.connections,
      catalog,
      cableLengthLimitsM: state.cableLengthLimitsM
    });
    expect(limited.findings.some((f) => f.code === 'CABLE-002' && f.severity === 'warning')).toBe(true);
  });

  it('BOQ foundation groups cable type and estimated length', () => {
    const state = new AppState();
    state.setRoom({ ...createDefaultRoom('conference'), width: 8, depth: 6, height: 3, openings: [], columns: [] });
    place(state, 'user-laptop-source', 'src', -2, 0, 1);
    place(state, 'lg-86uh5j', 'disp', 2, -2, 1.6);
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    const lines = cableBoqFromConnections(state.connections, cableRouteContext(state, catalog));
    expect(lines[0].cableType).toBe('HDMI');
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].estimatedTotalLengthM).toBeGreaterThan(0);
  });
});

describe('Visualization / selection', () => {
  it('selecting a connection focuses source and destination actions', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'lg-86uh5j', 'disp');
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    state.selectConnection(state.connections[0].id);
    expect(state.selectedConnectionId).toBe(state.connections[0].id);
    state.focusConnectionEndpoint('source');
    expect(state.selection).toEqual({ kind: 'equipment', id: 'src' });
    state.selectConnection(state.connections[0].id);
    state.showConnectionRoute(state.connections[0].id);
    expect(state.systemPhysicalView).toBe(true);
    expect(state.showCableRoutes).toBe(true);
    expect(state.workspaceMode).toBe('system');
  });

  it('maps CABLE findings to the system layer', () => {
    expect(overlayLayerForFinding('CABLE-001')).toBe('system');
  });
});

describe('Seat inspection', () => {
  it('uses 1.1 m occupant eye height and existing analysis', () => {
    const state = new AppState();
    state.setRoom({ ...createDefaultRoom('conference'), width: 8, depth: 6, height: 3, openings: [], columns: [] });
    state.seats = [{ id: 'S1', row: 1, indexInRow: 1, x: 0, z: 2, facing: 0, hasTable: true }];
    place(state, 'lg-86uh5j', 'disp', 0, -2.8, 1.65);
    const insp = inspectSeat(state.seats[0], state.equipment, catalog, state.room, state.tables);
    expect(insp.occupant.eyeHeightM).toBe(1.1);
    expect(insp.display).not.toBeNull();
    expect(insp.display!.distance.value).toBeGreaterThan(0);
  });

  it('failed viewing produces a non-pass overall', () => {
    const state = new AppState();
    state.setRoom({ ...createDefaultRoom('conference'), width: 20, depth: 20, height: 3, openings: [], columns: [] });
    state.seats = [{ id: 'S1', row: 1, indexInRow: 1, x: 0, z: 9, facing: 0, hasTable: true }];
    place(state, 'lg-86uh5j', 'disp', 0, -9, 1.65);
    const insp = inspectSeat(state.seats[0], state.equipment, catalog, state.room, state.tables);
    expect(insp.display).not.toBeNull();
    expect(insp.display!.overall === 'fail' || insp.display!.viewingDistance.status === 'fail').toBe(true);
  });
});
