import type { AppState } from '../../app/AppState';
import { lastValidationDelta, validationReportFor } from '../../av/validation/validationCache';

export function renderStatusBar(container: HTMLElement, state: AppState): void {
  container.innerHTML = '';
  const report = validationReportFor(state);
  const delta = lastValidationDelta();
  const sel =
    state.selection.kind !== 'none' && state.selection.id
      ? `${state.selection.kind} ${state.selection.id}`
      : 'Nothing selected';
  const parts: string[] = [];
  parts.push(state.room ? `${state.room.width.toFixed(1)} × ${state.room.depth.toFixed(1)} × ${state.room.height.toFixed(1)} m` : 'No room');
  parts.push(`Seats ${state.seats.length}`);
  parts.push(sel);
  parts.push(`Snap ${state.gridSpacingM.toFixed(2)} m`);
  parts.push('Units m');
  if (state.selectedConnectionId) parts.push(`Connection ${state.selectedConnectionId}`);
  parts.push(`✓ ${report.summary.passCount}  ⚠ ${report.summary.warningCount}  ✕ ${report.summary.errorCount}`);
  if (delta?.message) parts.push(delta.message);
  if (state.lastSnapNote) parts.push(state.lastSnapNote);
  if (state.canUndo()) parts.push('Ctrl+Z undo');

  parts.forEach((text, i) => {
    const span = document.createElement('span');
    span.textContent = text;
    container.appendChild(span);
    if (i < parts.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      container.appendChild(sep);
    }
  });
}
