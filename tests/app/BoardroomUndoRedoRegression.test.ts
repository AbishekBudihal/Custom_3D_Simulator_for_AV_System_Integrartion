/**
 * BoardroomUndoRedoRegression.test.ts
 *
 * Permanent regression guard for the wall-attached table bug that appeared
 * when undo/redo was introduced. Undo/redo must restore project state
 * verbatim — it must NEVER regenerate seating or let the renderer infer
 * table geometry from chair positions.
 */

import { describe, it, expect } from 'vitest';
import { AppState } from '../../src/app/AppState';
import { furnitureFingerprint } from '../../src/app/HistoryManager';
import { serializeProject, loadProjectInto } from '../../src/app/ProjectStore';
import { createDefaultRoom, type RoomModel } from '../../src/room/RoomModel';
import { defaultSeatingConfig, generateSeating } from '../../src/room/SeatingGenerator';
import { renderSeating } from '../../src/room/SeatingRenderer';

function boardroom10x7(): RoomModel {
  return {
    ...createDefaultRoom('boardroom'),
    width: 10,
    depth: 7,
    height: 3.2,
    openings: [],
    columns: [],
    presentationWall: 'front'
  };
}

function setupBoardroomState(): AppState {
  const state = new AppState();
  const room = boardroom10x7();
  const cfg = defaultSeatingConfig(12, 'boardroom');
  const { seats, tables } = generateSeating(room, cfg);

  state.setRoom(room);
  state.setSeats(seats, tables);
  // Clear setup history so tests start from a clean undo stack.
  state.clearHistory();
  return state;
}

function assertBoardroomTableIntegrity(state: AppState, label: string): void {
  const room = state.room!;
  const tables = state.tables;
  const seats = state.seats;

  expect(tables.length, `${label}: table count`).toBe(1);
  const t = tables[0];
  const hw = room.width / 2;
  const hd = room.depth / 2;
  const wallMargin = 0.6;

  expect(t.id, `${label}: table id`).toBe('conference-table');
  expect(t.centerX - t.sizeX / 2, `${label}: table not on left wall`).toBeGreaterThan(-hw + wallMargin);
  expect(t.centerX + t.sizeX / 2, `${label}: table not on right wall`).toBeLessThan(hw - wallMargin);
  expect(t.centerZ - t.sizeZ / 2, `${label}: table not on front wall`).toBeGreaterThan(-hd + wallMargin);
  expect(t.centerZ + t.sizeZ / 2, `${label}: table not on back wall`).toBeLessThan(hd - wallMargin);
  expect(Math.abs(t.centerX), `${label}: table centered on X`).toBeLessThan(0.5);

  seats.forEach((s) => {
    const outsideX = Math.abs(s.x - t.centerX) > t.sizeX / 2 - 0.05;
    const outsideZ = Math.abs(s.z - t.centerZ) > t.sizeZ / 2 - 0.05;
    expect(outsideX || outsideZ, `${label}: seat ${s.id} not inside table`).toBe(true);
  });

  // Renderer must consume TableSpec[] directly — never infer tables from seats.
  const sceneGroup = renderSeating(seats, tables);
  const tableMeshes = sceneGroup.children.filter((c) => c.userData?.pickable === 'table');
  expect(tableMeshes.length, `${label}: renderer table mesh count`).toBe(1);
  expect(tableMeshes[0].position.x, `${label}: renderer table X`).toBeCloseTo(t.centerX, 2);
  expect(tableMeshes[0].position.z, `${label}: renderer table Z`).toBeCloseTo(t.centerZ, 2);
}

describe('Boardroom undo/redo regression — furniture state must survive unrelated edits', () => {
  it('steps 1–7: add display → undo → redo preserves exact boardroom geometry', () => {
    const state = setupBoardroomState();
    const baseline = furnitureFingerprint(state);

    assertBoardroomTableIntegrity(state, 'baseline');

    state.addEquipment({
      instanceId: 'disp-1',
      productId: 'lg-86',
      name: '86" Display',
      position: { x: 0, y: 1.7, z: -3.4 },
      rotationY: 0,
      wall: 'front',
      placementMode: 'smart'
    });

    expect(state.equipment.length).toBe(1);
    // Equipment is not part of the furniture fingerprint — only room/seats/tables.
    expect(furnitureFingerprint(state)).toBe(baseline);

    const furnitureBeforeUndo = furnitureFingerprint(state);

    state.undo();
    expect(state.equipment.length).toBe(0);
    expect(furnitureFingerprint(state)).toBe(furnitureBeforeUndo);
    expect(furnitureFingerprint(state)).toBe(baseline);
    assertBoardroomTableIntegrity(state, 'after undo');

    state.redo();
    expect(state.equipment.length).toBe(1);
    expect(furnitureFingerprint({
      room: state.room,
      seats: state.seats,
      tables: state.tables
    })).toBe(baseline);
    assertBoardroomTableIntegrity(state, 'after redo');
  });

  it('steps 8–10: manual table move → undo restores original table position', () => {
    const state = setupBoardroomState();
    const tableId = state.tables[0].id;
    const originalX = state.tables[0].centerX;
    const originalZ = state.tables[0].centerZ;
    const baseline = furnitureFingerprint(state);

    state.updateTable(tableId, { centerX: originalX + 1.2, centerZ: originalZ + 0.5 });
    expect(state.tables[0].centerX).toBeCloseTo(originalX + 1.2);
    expect(furnitureFingerprint(state)).not.toBe(baseline);

    state.undo();
    expect(state.tables[0].centerX).toBeCloseTo(originalX);
    expect(state.tables[0].centerZ).toBeCloseTo(originalZ);
    expect(furnitureFingerprint(state)).toBe(baseline);
    assertBoardroomTableIntegrity(state, 'after table undo');
  });

  it('steps 11–12: manual chair move → undo/redo restores position and orientation', () => {
    const state = setupBoardroomState();
    const seatId = state.seats[0].id;
    const original = { ...state.seats.find((s) => s.id === seatId)! };
    const baseline = furnitureFingerprint(state);

    state.updateSeat(seatId, { x: original.x + 0.4, z: original.z - 0.3, facing: original.facing + 0.2 });
    const moved = state.seats.find((s) => s.id === seatId)!;
    expect(moved.x).toBeCloseTo(original.x + 0.4);
    expect(moved.facing).toBeCloseTo(original.facing + 0.2);

    state.undo();
    const restored = state.seats.find((s) => s.id === seatId)!;
    expect(restored.x).toBeCloseTo(original.x);
    expect(restored.z).toBeCloseTo(original.z);
    expect(restored.facing).toBeCloseTo(original.facing);
    expect(furnitureFingerprint(state)).toBe(baseline);

    state.redo();
    const redone = state.seats.find((s) => s.id === seatId)!;
    expect(redone.x).toBeCloseTo(original.x + 0.4);
    expect(redone.z).toBeCloseTo(original.z - 0.3);
    expect(redone.facing).toBeCloseTo(original.facing + 0.2);
  });

  it('step 13: switching 3D/plan/elevation view modes does not mutate furniture state', () => {
    const state = setupBoardroomState();
    const baseline = furnitureFingerprint(state);

    state.setViewMode('plan');
    expect(furnitureFingerprint(state)).toBe(baseline);
    state.setViewMode('elevation');
    expect(furnitureFingerprint(state)).toBe(baseline);
    state.setViewMode('3d');
    expect(furnitureFingerprint(state)).toBe(baseline);
    assertBoardroomTableIntegrity(state, 'after view switches');
  });

  it('step 14: serialize/deserialize round-trip preserves TableSpec[] and furniture state', () => {
    const state = setupBoardroomState();
    const tableId = state.tables[0].id;
    state.updateTable(tableId, { centerX: 0.3, centerZ: -0.2 });
    state.updateSeat(state.seats[0].id, { x: state.seats[0].x + 0.1 });
    state.addEquipment({
      instanceId: 'disp-1',
      productId: 'lg-86',
      name: 'Display',
      position: { x: 0, y: 1.7, z: -3.4 },
      rotationY: 0
    });

    const fingerprintBefore = furnitureFingerprint(state);
    const file = serializeProject(state);

    const loaded = new AppState();
    loadProjectInto(loaded, file);

    expect(furnitureFingerprint(loaded)).toBe(fingerprintBefore);
    expect(loaded.tables.length).toBe(1);
    expect(loaded.tables[0].id).toBe('conference-table');
    expect(loaded.equipment.length).toBe(1);
    expect(loaded.canUndo()).toBe(false);
    assertBoardroomTableIntegrity(loaded, 'after deserialize');
  });

  it('drag gesture (prepareHistory → live update → finishGesture) undo restores pre-drag furniture', () => {
    const state = setupBoardroomState();
    const seatId = state.seats[0].id;
    const before = { ...state.seats.find((s) => s.id === seatId)! };
    const baseline = furnitureFingerprint(state);

    state.prepareHistory();
    state.updateSeat(seatId, { x: before.x + 0.8, z: before.z + 0.6 }, { recordHistory: false });
    state.finishGesture();

    expect(state.seats.find((s) => s.id === seatId)!.x).toBeCloseTo(before.x + 0.8);

    state.undo();
    const restored = state.seats.find((s) => s.id === seatId)!;
    expect(restored.x).toBeCloseTo(before.x);
    expect(restored.z).toBeCloseTo(before.z);
    expect(furnitureFingerprint(state)).toBe(baseline);
    assertBoardroomTableIntegrity(state, 'after gesture undo');
  });

  it('undo never calls generateSeating — table count stays 1 after multiple unrelated undos', () => {
    const state = setupBoardroomState();

    state.addEquipment({
      instanceId: 'disp-1',
      productId: 'lg-86',
      name: 'Display',
      position: { x: 0, y: 1.7, z: -3.4 },
      rotationY: 0
    });
    state.updateEquipment('disp-1', { position: { x: 0.5, y: 1.7, z: -3.4 } });
    state.updateSeat(state.seats[0].id, { x: state.seats[0].x + 0.2 });

    state.undo(); // undo seat move
    state.undo(); // undo equipment move
    state.undo(); // undo equipment add

    expect(state.tables.length).toBe(1);
    expect(state.tables[0].id).toBe('conference-table');
    assertBoardroomTableIntegrity(state, 'after triple undo');
  });

  it('Phase B: analyze / move display / undo / redo / view-mode switch does not attach the table to a wall', () => {
    const state = setupBoardroomState();
    const baseline = furnitureFingerprint(state);

    state.addEquipment({
      instanceId: 'disp-1',
      productId: 'lg-86',
      name: 'Display',
      position: { x: 0, y: 1.7, z: -3.4 },
      rotationY: 0,
      wall: 'front',
      placementMode: 'smart'
    });
    state.enableDisplayAnalysis();
    state.setDisplayAnalysisView({ heatmap: true, sightlines: 'all', seatStatus: true });
    expect(furnitureFingerprint(state)).toBe(baseline);

    state.updateEquipment('disp-1', { position: { x: 0.8, y: 1.7, z: -3.4 } });
    state.undo();
    expect(furnitureFingerprint(state)).toBe(baseline);
    assertBoardroomTableIntegrity(state, 'after display undo with analysis on');

    state.redo();
    expect(state.equipment[0].position.x).toBeCloseTo(0.8);
    expect(furnitureFingerprint({ room: state.room, seats: state.seats, tables: state.tables })).toBe(baseline);

    state.setViewMode('plan');
    state.setViewMode('3d');
    expect(furnitureFingerprint({ room: state.room, seats: state.seats, tables: state.tables })).toBe(baseline);
    assertBoardroomTableIntegrity(state, 'after 3D/plan switch with analysis on');
  });
});
