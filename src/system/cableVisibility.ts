/**
 * When cable routes should draw in Plan/3D. Geometry still comes from CableRouter.
 */

import type { SystemConnection } from './SystemTypes';

export interface CableVizState {
  showCableRoutes: boolean;
  selectedConnectionId: string | null;
  highlightedConnectionIds: string[];
  workspaceMode: string;
  systemPhysicalView: boolean;
  selection: { kind: string; id: string | null };
  connections: SystemConnection[];
}

export function connectionTouchesSelection(state: CableVizState, c: SystemConnection): boolean {
  if (state.selection.kind !== 'equipment' || !state.selection.id) return false;
  return c.fromInstanceId === state.selection.id || c.toInstanceId === state.selection.id;
}

export function shouldShowCableRoutes(state: CableVizState): boolean {
  if (state.showCableRoutes) return true;
  if (state.selectedConnectionId) return true;
  if (state.highlightedConnectionIds.length) return true;
  if (state.workspaceMode === 'system' && state.systemPhysicalView) return true;
  if (state.selection.kind === 'equipment' && state.selection.id) {
    return state.connections.some((c) => connectionTouchesSelection(state, c));
  }
  return false;
}

export function shouldDrawConnection(state: CableVizState, c: SystemConnection): boolean {
  if (state.showCableRoutes || (state.workspaceMode === 'system' && state.systemPhysicalView)) return true;
  if (state.selectedConnectionId === c.id) return true;
  if (state.highlightedConnectionIds.includes(c.id)) return true;
  return connectionTouchesSelection(state, c);
}

export function isCableSelected(state: CableVizState, c: SystemConnection): boolean {
  return state.selectedConnectionId === c.id || state.highlightedConnectionIds.includes(c.id) || connectionTouchesSelection(state, c);
}
