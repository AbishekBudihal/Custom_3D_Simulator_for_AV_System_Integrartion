import { describe, it, expect } from 'vitest';
import { AppState } from '../../src/app/AppState';
import { loadDefaultCatalog } from '../../src/catalog/loadCatalog';
import { resolveProductPorts, resolveInstancePorts } from '../../src/system/PortResolver';
import { canConnectPorts, duplicateConnection, occupancyConflict } from '../../src/system/PortCompatibility';
import { enumerateSignalPaths } from '../../src/system/SignalPathEngine';
import { runDesignValidation } from '../../src/av/validation/DesignValidationEngine';
import { overlayLayerForFinding } from '../../src/av/simulation/AnalysisLayer';
import { furnitureFingerprint } from '../../src/app/HistoryManager';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { defaultSeatingConfig, generateSeating } from '../../src/room/SeatingGenerator';

const catalog = loadDefaultCatalog();

function place(state: AppState, productId: string, instanceId: string): void {
  const p = catalog.get(productId)!;
  state.addEquipment({
    instanceId,
    productId,
    name: p.model,
    position: { x: 0, y: 1, z: 0 },
    rotationY: 0
  });
}

describe('System topology', () => {
  it('derives display HDMI inputs from catalog connectivity', () => {
    const p = catalog.get('lg-86uh5j')!;
    const { ports, incomplete } = resolveProductPorts(p);
    expect(incomplete).toBe(false);
    expect(ports.filter((x) => x.connector === 'hdmi' && x.direction === 'input').length).toBe(3);
  });

  it('rejects HDMI video into analog line audio', () => {
    const laptop = resolveInstancePorts('a', 'user-laptop-source', catalog).find((p) => p.id === 'hdmi-out')!;
    const dsp = resolveInstancePorts('b', 'user-dsp-4ch', catalog).find((p) => p.id === 'line-in-1')!;
    const r = canConnectPorts(laptop, dsp);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.toLowerCase()).toMatch(/cannot connect|mismatch/);
  });

  it('creates a valid HDMI connection and prevents duplicates and occupancy', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'lg-86uh5j', 'disp');
    expect(state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1')).toBe(true);
    expect(state.connections.length).toBe(1);
    expect(state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1')).toBe(false);
    expect(duplicateConnection(state.connections, 'src', 'hdmi-out', 'disp', 'hdmi-in-1')).toBe(true);
    expect(occupancyConflict(state.connections, 'src', 'hdmi-out', 'disp', 'hdmi-in-2')).toBeTruthy();
  });

  it('undo/redo restores connections without touching TableSpec seating', () => {
    const state = new AppState();
    const room = createDefaultRoom('boardroom');
    state.setRoom(room);
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(12, 'boardroom'));
    state.setSeats(seats, tables);
    const fp = furnitureFingerprint(state);
    place(state, 'user-laptop-source', 'src');
    place(state, 'lg-86uh5j', 'disp');
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    expect(state.connections.length).toBe(1);
    state.undo();
    expect(state.connections.length).toBe(0);
    expect(furnitureFingerprint(state)).toBe(fp);
    state.redo();
    expect(state.connections.length).toBe(1);
    expect(furnitureFingerprint(state)).toBe(fp);
  });

  it('undo of device creation also drops its connections', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'lg-86uh5j', 'disp');
    state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1');
    state.removeEquipment('disp');
    expect(state.connections.length).toBe(0);
    state.undo();
    expect(state.equipment.some((e) => e.instanceId === 'disp')).toBe(true);
    expect(state.connections.length).toBe(1);
  });

  it('traverses laptop → switcher → display as a VIDEO path', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'user-hdmi-switcher-2x1', 'sw');
    place(state, 'lg-86uh5j', 'disp');
    expect(state.addConnection('src', 'hdmi-out', 'sw', 'hdmi-in-1')).toBe(true);
    expect(state.addConnection('sw', 'hdmi-out', 'disp', 'hdmi-in-1')).toBe(true);
    state.setRoute('sw', 'hdmi-in-1', 'hdmi-out');
    const paths = enumerateSignalPaths(state.equipment, state.connections, catalog, state.routes);
    expect(paths.some((p) => p.signalType === 'VIDEO' && p.hops.length >= 3 && p.complete)).toBe(true);
  });

  it('models extender TX–RX as VIDEO over Cat6, not HDMI cable', () => {
    const state = new AppState();
    place(state, 'user-hdmi-extender-tx', 'tx');
    place(state, 'user-hdmi-extender-rx', 'rx');
    expect(state.addConnection('tx', 'cat-out', 'rx', 'cat-in')).toBe(true);
    expect(state.connections[0].physicalMedium).toBe('Cat6');
    expect(state.connections[0].transport).toBe('hdmi-over-cat');
    expect(state.connections[0].signalType).toBe('VIDEO');
  });

  it('system selection is the same equipment id as 3D/Plan', () => {
    const state = new AppState();
    place(state, 'lg-86uh5j', 'disp');
    state.select('equipment', 'disp');
    expect(state.selectedEquipmentIds()).toEqual(['disp']);
    state.setWorkspaceMode('system');
    expect(state.selection.id).toBe('disp');
  });

  it('does not invent camera ports', () => {
    const cam = catalog.get('yealink-uvc84')!;
    expect(resolveProductPorts(cam).incomplete).toBe(true);
  });

  it('SYSTEM-004 flags passive speaker without amplifier path when an amp exists', () => {
    const state = new AppState();
    place(state, 'qsc-adc6t', 'spk');
    place(state, 'user-amp-2ch', 'amp');
    const report = runDesignValidation({
      room: null,
      seats: [],
      tables: [],
      equipment: state.equipment,
      connections: state.connections,
      catalog
    });
    expect(report.findings.some((f) => f.code === 'SYSTEM-004' && f.severity === 'error')).toBe(true);
  });

  it('does not emit SYSTEM-002 on a spatial-only display design', () => {
    const state = new AppState();
    place(state, 'lg-86uh5j', 'disp');
    const report = runDesignValidation({
      room: null,
      seats: [],
      tables: [],
      equipment: state.equipment,
      connections: [],
      catalog
    });
    expect(report.findings.some((f) => f.code === 'SYSTEM-002')).toBe(false);
  });

  it('maps SIGNAL/SYSTEM findings to the system overlay layer', () => {
    expect(overlayLayerForFinding('SIGNAL-007')).toBe('system');
    expect(overlayLayerForFinding('SYSTEM-004')).toBe('system');
  });

  it('does not store system canvas pan in undo snapshots', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    state.setSystemView({ x: 90, y: 40 }, 1.2);
    const snap = state.captureSnapshot() as unknown as Record<string, unknown>;
    expect(snap.systemPan).toBeUndefined();
    expect(snap.systemZoom).toBeUndefined();
    expect(snap.connections).toEqual([]);
  });

  it('routing matrix state is undoable and required for switcher paths', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'user-hdmi-switcher-2x1', 'sw');
    place(state, 'lg-86uh5j', 'disp');
    state.addConnection('src', 'hdmi-out', 'sw', 'hdmi-in-1');
    state.addConnection('sw', 'hdmi-out', 'disp', 'hdmi-in-1');
    const before = enumerateSignalPaths(state.equipment, state.connections, catalog, state.routes);
    expect(before.some((p) => p.complete && p.hops.length >= 3)).toBe(false);
    state.setRoute('sw', 'hdmi-in-1', 'hdmi-out');
    expect(state.routes.length).toBe(1);
    state.undo();
    expect(state.routes.length).toBe(0);
    state.redo();
    expect(state.routes[0].inputPortId).toBe('hdmi-in-1');
  });

  it('system layout does not mutate physical coordinates', () => {
    const state = new AppState();
    place(state, 'lg-86uh5j', 'disp');
    const xyz = { ...state.equipment[0].position };
    state.ensureSystemLayout();
    state.setSystemNodePos('disp', 400, 80);
    expect(state.equipment[0].position).toEqual(xyz);
    expect(state.systemLayout.disp).toEqual({ x: 400, y: 80 });
  });

  it('View Issue for SYSTEM findings opens System workspace', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    state.inspectFinding('SYSTEM-002-src', [], [], ['src']);
    expect(state.workspaceMode).toBe('system');
    expect(state.selection.id).toBe('src');
  });

  it('SYSTEM-001 reports incomplete switcher path without a route', () => {
    const state = new AppState();
    place(state, 'user-laptop-source', 'src');
    place(state, 'user-hdmi-switcher-2x1', 'sw');
    state.addConnection('src', 'hdmi-out', 'sw', 'hdmi-in-1');
    const report = runDesignValidation({
      room: null,
      seats: [],
      tables: [],
      equipment: state.equipment,
      connections: state.connections,
      routes: [],
      catalog
    });
    expect(report.findings.some((f) => f.code === 'SYSTEM-001')).toBe(true);
  });
});
