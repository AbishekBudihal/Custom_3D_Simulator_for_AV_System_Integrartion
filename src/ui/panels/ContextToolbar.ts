/**
 * ContextToolbar.ts
 * Only actions relevant to the current selection and workspace mode.
 */

import type { AppState } from '../../app/AppState';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';
import type { AlignCommand } from '../../interaction/AlignEngine';

const catalog = loadDefaultCatalog();

export function renderContextToolbar(container: HTMLElement, state: AppState): void {
  container.innerHTML = '';
  const bar = document.createElement('div');
  bar.className = 'context-toolbar';

  if (state.viewerMode.active) {
    bar.appendChild(mkBtn('Exit Viewer', () => state.exitViewerMode(), 'primary'));
    container.appendChild(bar);
    return;
  }

  const undoBtn = mkBtn('Undo', () => state.undo());
  undoBtn.disabled = !state.canUndo();
  undoBtn.title = 'Ctrl+Z';
  const redoBtn = mkBtn('Redo', () => state.redo());
  redoBtn.disabled = !state.canRedo();
  redoBtn.title = 'Ctrl+Y';
  bar.append(undoBtn, redoBtn, mkSep());

  if (state.workspaceMode === 'system') {
    bar.append(
      mkBtn('Auto layout', () => state.autoLayoutSystem()),
      mkBtn('Group', () => state.groupSelected()),
      mkBtn('Validate', () => state.setWorkspaceMode('validate')),
      mkBtn('View in Room', () => state.viewInRoom())
    );
    if (state.selectedEquipmentIds().length === 2) {
      bar.append(mkBtn('Connect compatible', () => state.connectCompatiblePair(state.selectedEquipmentIds()[0], state.selectedEquipmentIds()[1]), 'primary'));
    }
    container.appendChild(bar);
    return;
  }

  if (state.selection.kind === 'equipment' && state.selection.id) {
    renderEquipmentToolbar(bar, state, state.selection.id);
  } else if (state.selection.kind === 'seat' && state.selection.id) {
    bar.append(
      mkBtn('View from Seat', () => state.enterViewerMode(state.selection.id!), 'primary'),
      mkBtn('Plan', () => state.setViewMode('plan'))
    );
  } else if (state.selection.kind === 'table' && state.selection.id) {
    bar.append(mkBtn('Move', () => state.setTransformMode('translate'), 'active'), mkBtn('Edit Seating', () => state.setDesignTool('seating')));
  } else {
    bar.append(
      mkBtn('AUTO DESIGN', () => state.requestAutoDesign(), 'primary'),
      mkBtn('Fit', () => state.requestFocus()),
      mkBtn('3D', () => state.setViewMode('3d'), state.viewMode === '3d' ? 'active' : undefined),
      mkBtn('Plan', () => state.setViewMode('plan'), state.viewMode === 'plan' ? 'active' : undefined),
      mkBtn('Elev', () => state.setViewMode('elevation'), state.viewMode === 'elevation' ? 'active' : undefined)
    );
  }

  container.appendChild(bar);
}

function renderEquipmentToolbar(bar: HTMLElement, state: AppState, instanceId: string): void {
  const inst = state.equipment.find((e) => e.instanceId === instanceId);
  const product = inst ? catalog.get(inst.productId) : null;
  const cat = product?.category;

  bar.append(
    mkBtn('Move', () => state.setTransformMode('translate'), state.transformMode === 'translate' ? 'active' : undefined),
    mkBtn('Rotate', () => state.setTransformMode('rotate'), state.transformMode === 'rotate' ? 'active' : undefined)
  );

  if (state.viewMode === 'plan' && state.selectedEquipmentIds().length >= 2) {
    bar.append(mkSep());
    ([['left', 'Align −X'], ['centerX', 'Center X'], ['right', 'Align +X'], ['front', 'Align −Z'], ['distributeX', 'Distribute X']] as Array<[AlignCommand, string]>).forEach(
      ([cmd, label]) => bar.appendChild(mkBtn(label, () => state.applyAlign(cmd)))
    );
  }

  bar.append(mkSep());
  if (cat === 'display') {
    bar.appendChild(mkBtn('Analyze', () => {
      state.enableDisplayAnalysis();
      state.setWorkspaceMode('simulate');
    }));
  }
  if (cat === 'microphone') {
    bar.appendChild(mkBtn('Analyze Pickup', () => {
      state.enableMicAnalysis();
      state.setWorkspaceMode('simulate');
    }));
  }
  if (cat === 'speaker') {
    bar.appendChild(mkBtn('Analyze Coverage', () => {
      state.enableAudioAnalysis();
      state.setWorkspaceMode('simulate');
    }));
  }
  if (cat === 'camera') {
    bar.appendChild(mkBtn('Analyze FOV', () => {
      state.enableCameraAnalysis();
      state.setWorkspaceMode('simulate');
    }));
  }

  bar.append(
    mkBtn('Duplicate', () => state.duplicateSelectedEquipment()),
    mkBtn('Delete', () => state.deleteSelected()),
    mkBtn('Validate', () => state.setWorkspaceMode('validate'))
  );
}

function mkBtn(label: string, onClick: () => void, variant?: 'primary' | 'active'): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.className = 'ctx-btn';
  if (variant === 'primary') b.classList.add('primary');
  if (variant === 'active') b.classList.add('active');
  b.onclick = onClick;
  return b;
}

function mkSep(): HTMLElement {
  const s = document.createElement('span');
  s.className = 'ctx-sep';
  return s;
}
