import { describe, it, expect } from 'vitest';
import { HistoryManager, cloneSnapshot, type AppStateSnapshot } from '../../src/app/HistoryManager';
import { createDefaultRoom } from '../../src/room/RoomModel';

function emptySnap(): AppStateSnapshot {
  return {
    room: createDefaultRoom('conference'),
    seats: [{ id: 'S1', row: 1, indexInRow: 1, x: 0, z: 0, facing: 0, hasTable: false }],
    tables: [],
    racks: [],
    equipment: [],
    connections: [],
    routes: [],
    systemGroups: [],
    systemLayout: {},
    selection: { kind: 'none', id: null }
  };
}

describe('HistoryManager', () => {
  it('undo restores previous snapshot and redo brings it back', () => {
    const hm = new HistoryManager();
    const snap1 = emptySnap();
    const snap2 = cloneSnapshot(snap1);
    snap2.seats[0].x = 2;

    hm.push(snap1);
    const restored = hm.undo(snap2);
    expect(restored?.seats[0].x).toBe(0);

    const redone = hm.redo(restored!);
    expect(redone?.seats[0].x).toBe(2);
  });

  it('push clears redo stack', () => {
    const hm = new HistoryManager();
    const a = emptySnap();
    const b = cloneSnapshot(a);
    b.seats[0].x = 1;
    const c = cloneSnapshot(b);
    c.seats[0].x = 2;

    hm.push(a);
    hm.undo(c);
    hm.push(b);
    expect(hm.canRedo()).toBe(false);
  });
});
