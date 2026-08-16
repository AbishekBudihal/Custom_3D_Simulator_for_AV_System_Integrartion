/**
 * HistoryManager.ts
 * Snapshot-based undo/redo for project state mutations. UI gestures
 * (transform drag, inspector edits) call AppState.prepareHistory() once
 * at the start of a gesture; discrete actions push automatically.
 */

import type { RoomModel } from '../room/RoomModel';
import type { Seat, TableSpec } from '../room/SeatingGenerator';
import type { EquipmentInstance } from '../catalog/EquipmentCatalog';
import type { Selection } from './AppState';
import type { SystemConnection, SystemGroup, SystemRoute } from '../system/SystemTypes';

export interface AppStateSnapshot {
  room: RoomModel | null;
  seats: Seat[];
  tables: TableSpec[];
  equipment: EquipmentInstance[];
  connections: SystemConnection[];
  routes: SystemRoute[];
  systemGroups: SystemGroup[];
  systemLayout: Record<string, { x: number; y: number }>;
  selection: Selection;
}

export class HistoryManager {
  private undoStack: AppStateSnapshot[] = [];
  private redoStack: AppStateSnapshot[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  push(snapshot: AppStateSnapshot): void {
    this.undoStack.push(cloneSnapshot(snapshot));
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Returns the snapshot to restore, pushing `current` onto the redo stack. */
  undo(current: AppStateSnapshot): AppStateSnapshot | null {
    if (!this.canUndo()) return null;
    this.redoStack.push(cloneSnapshot(current));
    return this.undoStack.pop() ?? null;
  }

  /** Returns the snapshot to restore, pushing `current` onto the undo stack. */
  redo(current: AppStateSnapshot): AppStateSnapshot | null {
    if (!this.canRedo()) return null;
    this.undoStack.push(cloneSnapshot(current));
    return this.redoStack.pop() ?? null;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

export function cloneSnapshot(s: AppStateSnapshot): AppStateSnapshot {
  const cloned = JSON.parse(JSON.stringify(s)) as AppStateSnapshot;
  cloned.connections = cloned.connections ?? [];
  cloned.routes = cloned.routes ?? [];
  cloned.systemGroups = cloned.systemGroups ?? [];
  cloned.systemLayout = cloned.systemLayout ?? {};
  return cloned;
}

/** Stable fingerprint of furniture geometry for regression comparisons. */
export function furnitureFingerprint(state: {
  room: RoomModel | null;
  seats: Seat[];
  tables: TableSpec[];
}): string {
  return JSON.stringify({
    room: state.room
      ? {
          width: state.room.width,
          depth: state.room.depth,
          height: state.room.height,
          presentationWall: state.room.presentationWall
        }
      : null,
    seats: state.seats.map((s) => ({
      id: s.id,
      x: s.x,
      z: s.z,
      facing: s.facing,
      row: s.row,
      indexInRow: s.indexInRow,
      hasTable: s.hasTable
    })),
    tables: state.tables.map((t) => ({
      id: t.id,
      centerX: t.centerX,
      centerZ: t.centerZ,
      sizeX: t.sizeX,
      sizeZ: t.sizeZ,
      height: t.height,
      thickness: t.thickness,
      shape: t.shape,
      furnitureId: t.furnitureId,
      hasCableWell: t.hasCableWell
    }))
  });
}
