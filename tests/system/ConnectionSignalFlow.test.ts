import { describe, it, expect } from 'vitest';
import { AppState } from '../../src/app/AppState';
import { loadDefaultCatalog } from '../../src/catalog/loadCatalog';
import { canConnectPorts, canConnectWithCable, occupancyConflict } from '../../src/system/PortCompatibility';
import { resolveInstancePorts } from '../../src/system/PortResolver';
import { cachedCableRoute, routeForConnection } from '../../src/system/CableRouter';
import { cableRouteContext } from '../../src/system/cableContext';
import { runDesignValidation } from '../../src/av/validation/DesignValidationEngine';
import { overlayLayerForFinding } from '../../src/av/simulation/AnalysisLayer';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { defaultFloorRack } from '../../src/av/AVRack';
import { serializeProject, loadProjectInto, parseProjectJson } from '../../src/app/ProjectStore';
import { systemCompletenessFromFindings } from '../../src/system/ConnectionStatus';
import { splitDivisibleZones } from '../../src/room/RoomZones';

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

function reportOf(state: AppState) {
  return runDesignValidation({
    room: state.room,
    seats: state.seats,
    tables: state.tables,
    equipment: state.equipment,
    connections: state.connections,
    racks: state.racks,
    catalog
  });
}

describe('Connection signal flow', () => {
  it('A: valid HDMI connection', () => {
    const from = resolveInstancePorts('a', 'user-laptop-source', catalog).find((p) => p.id === 'hdmi-out')!;
    const to = resolveInstancePorts('b', 'lg-86uh5j', catalog).find((p) => p.id === 'hdmi-in-1')!;
    const r = canConnectPorts(from, to);
    expect(r.ok).toBe(true);
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'lg-86uh5j', 'disp');
    expect(state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1')).toBe(true);
    expect(state.connections[0].signalType).toBe('VIDEO');
    expect(state.connections[0].physicalMedium).toBe('HDMI');
  });

  it('B: invalid input → input', () => {
    const a = resolveInstancePorts('a', 'lg-86uh5j', catalog).find((p) => p.id === 'hdmi-in-1')!;
    const b = resolveInstancePorts('b', 'lg-86uh5j', catalog).find((p) => p.id === 'hdmi-in-2')!;
    const r = canConnectPorts(a, b);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CONN-001');
  });

  it('C: invalid output → output', () => {
    const a = resolveInstancePorts('a', 'user-laptop-source', catalog).find((p) => p.id === 'hdmi-out')!;
    const b = resolveInstancePorts('b', 'user-laptop-source', catalog).find((p) => p.id === 'hdmi-out')!;
    a.instanceId = 'src-a';
    b.instanceId = 'src-b';
    const r = canConnectPorts(a, b);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CONN-001');
  });

  it('D: signal mismatch', () => {
    const from = resolveInstancePorts('a', 'user-laptop-source', catalog).find((p) => p.id === 'hdmi-out')!;
    const to = resolveInstancePorts('b', 'user-net-switch-8', catalog).find((p) => p.id === 'p1')!;
    const r = canConnectPorts(from, to);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CONN-002');
  });

  it('E: physical interface mismatch', () => {
    const from = resolveInstancePorts('a', 'user-laptop-source', catalog).find((p) => p.id === 'hdmi-out')!;
    const to = resolveInstancePorts('b', 'user-laptop-source', catalog).find((p) => p.id === 'usbc-out')!;
    to.instanceId = 'other';
    to.direction = 'input';
    const r = canConnectPorts(from, to);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CONN-003');
  });

  it('F: occupied port', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'lg-86uh5j', 'disp');
    expect(state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1')).toBe(true);
    expect(occupancyConflict(state.connections, 'src', 'hdmi-out', 'disp', 'hdmi-in-2')).toBeTruthy();
    expect(state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-2')).toBe(false);
  });

  it('G: optional unused port does not emit CONN-006', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'lg-86uh5j', 'disp');
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    const report = reportOf(state);
    expect(report.findings.some((f) => f.code === 'CONN-006' && f.message.includes('USB-C'))).toBe(false);
  });

  it('H: required connection missing', () => {
    const state = new AppState();
    place(state, 'user-hdmi-switcher-2x1', 'sw');
    place(state, 'user-laptop-source', 'src');
    state.addConnection('src', 'hdmi-out', 'sw', 'hdmi-in-1');
    const report = reportOf(state);
    expect(report.findings.some((f) => f.code === 'CONN-006' && f.message.includes('HDMI OUT'))).toBe(true);
  });

  it('I: connection deletion', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'lg-86uh5j', 'disp');
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    state.removeConnection(state.connections[0].id);
    expect(state.connections.length).toBe(0);
  });

  it('J: undo/redo connect, delete, and cable type', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'lg-86uh5j', 'disp');
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    const id = state.connections[0].id;
    expect(state.updateConnectionCableType(id, 'HDMI')).toBe(true);
    expect(state.updateConnectionCableType(id, 'XLR')).toBe(false);
    state.undo();
    expect(state.connections.length).toBe(1);
    state.removeConnection(id);
    expect(state.connections.length).toBe(0);
    state.undo();
    expect(state.connections.length).toBe(1);
  });

  it('K/L: cable route generation and polyline length', () => {
    const state = new AppState();
    state.setRoom({ ...createDefaultRoom('conference'), width: 10, depth: 8, height: 3, openings: [], columns: [] });
    place(state, 'user-laptop-source', 'src', -3, 2, 1);
    place(state, 'lg-86uh5j', 'disp', 0, -3.5, 1.6);
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    const route = routeForConnection(state.connections[0], cableRouteContext(state, catalog));
    expect(route.segments.length).toBeGreaterThan(1);
    const euclid = Math.hypot(-3 - 0, 1 - 1.6, 2 - -3.5);
    expect(route.totalLength).toBeGreaterThan(euclid);
  });

  it('M: device movement updates route', () => {
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

  it('N: rack-mounted device connection uses rack location', () => {
    const state = new AppState();
    state.setRoom({ ...createDefaultRoom('conference'), width: 10, depth: 8, height: 3, openings: [], columns: [] });
    const rack = { ...defaultFloorRack(), x: 4, z: 3 };
    state.setRacks([rack]);
    place(state, 'user-touch-controller', 'tp', -2, 0, 1.1);
    place(state, 'user-net-switch-8', 'sw', 0, 0, 0.5);
    state.assignEquipmentToRack('sw', rack.id, 1);
    expect(state.addConnection('tp', 'net-1', 'sw', 'p1')).toBe(true);
    const route = cachedCableRoute(state.connections[0], cableRouteContext(state, catalog));
    expect(route.segments.length).toBeGreaterThan(0);
  });

  it('O: save/load preserves connections', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'lg-86uh5j', 'disp');
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    const json = JSON.stringify(serializeProject(state));
    const parsed = parseProjectJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const next = new AppState();
    expect(loadProjectInto(next, parsed.file).ok).toBe(true);
    expect(next.connections.length).toBe(1);
    expect(next.connections[0].fromPortId).toBe('hdmi-out');
    expect(next.connections[0].signalType).toBe('VIDEO');
    const empty = parseProjectJson(JSON.stringify({ project: { name: 'old', designer: '', createdAt: '', version: '0.1.0', roomUseCase: 'conference' }, room: null, seating: [], equipment: [] }));
    expect(empty.ok).toBe(true);
    if (empty.ok) {
      const legacy = new AppState();
      expect(loadProjectInto(legacy, empty.file).ok).toBe(true);
      expect(legacy.connections).toEqual([]);
    }
  });

  it('P: divisible room equipment connections remain valid', () => {
    const state = new AppState();
    const room = createDefaultRoom('conference');
    room.divisible = true;
    room.zones = splitDivisibleZones(room);
    state.setRoom(room);
    place(state, 'user-laptop-source', 'src', -2, 0, 1);
    place(state, 'lg-86uh5j', 'disp', 2, 0, 1.6);
    expect(state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1')).toBe(true);
    expect(reportOf(state).findings.some((f) => f.code === 'CONN-001')).toBe(false);
  });

  it('Q: multiple connections in one system including HDBaseT hops', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'user-hdmi-extender-tx', 'tx');
    place(state, 'user-hdmi-extender-rx', 'rx');
    place(state, 'lg-86uh5j', 'disp');
    expect(state.addConnection('src', 'hdmi-out', 'tx', 'hdmi-in')).toBe(true);
    expect(state.addConnection('tx', 'cat-out', 'rx', 'cat-in')).toBe(true);
    expect(state.addConnection('rx', 'hdmi-out', 'disp', 'hdmi-in-1')).toBe(true);
    expect(state.connections[1].physicalMedium).toBe('Cat6');
    expect(state.connections.length).toBe(3);
  });

  it('R: Design Health system completeness consumes validation findings', () => {
    const state = new AppState();
    place(state, 'lg-86uh5j', 'disp');
    place(state, 'user-laptop-source', 'src');
    const before = systemCompletenessFromFindings(reportOf(state).findings, state.equipment, catalog);
    expect(before.some((i) => i.label.toLowerCase().includes('display'))).toBe(true);
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    const after = systemCompletenessFromFindings(reportOf(state).findings, state.equipment, catalog);
    expect(after.some((i) => i.label.toLowerCase().includes('display video connection missing'))).toBe(false);
  });

  it('CONN-005 missing device/port', () => {
    const report = runDesignValidation({
      room: null,
      seats: [],
      tables: [],
      equipment: [],
      connections: [
        {
          id: 'ghost',
          fromInstanceId: 'missing',
          fromPortId: 'hdmi-out',
          toInstanceId: 'gone',
          toPortId: 'hdmi-in-1',
          signalType: 'VIDEO',
          transport: 'hdmi',
          physicalMedium: 'HDMI'
        }
      ],
      catalog
    });
    expect(report.findings.some((f) => f.code === 'CONN-005')).toBe(true);
  });

  it('CONN-007 invalid cable type on an otherwise valid hop', () => {
    const from = resolveInstancePorts('a', 'user-laptop-source', catalog).find((p) => p.id === 'hdmi-out')!;
    const to = resolveInstancePorts('b', 'lg-86uh5j', catalog).find((p) => p.id === 'hdmi-in-1')!;
    const r = canConnectWithCable(from, to, 'XLR');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CONN-007');
  });

  it('maps CONN findings to the system overlay layer', () => {
    expect(overlayLayerForFinding('CONN-001')).toBe('system');
    expect(overlayLayerForFinding('CONN-008')).toBe('system');
  });
});
