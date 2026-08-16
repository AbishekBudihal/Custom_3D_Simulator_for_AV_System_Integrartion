/**
 * DisplayAnalysisPanel.ts
 * Contextual ANALYZE DISPLAY UI. Consumes DesignAnalysis results —
 * does not recalculate viewing geometry itself.
 */

import type { AppState } from '../../app/AppState';
import {
  analyzeAllSeatsAgainstDisplay,
  projectObstacles,
  resolveActiveDisplay,
  summarizeDesignHealth,
  viewingHealthFromSummary
} from '../../av/DesignAnalysis';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';
import { renderMicAnalysisControls } from './MicAnalysisPanel';
import { renderAudioAnalysisControls } from './AudioAnalysisPanel';
import { renderCameraAnalysisControls } from './CameraAnalysisPanel';

const catalog = loadDefaultCatalog();

export function renderDisplayAnalysisControls(body: HTMLElement, state: AppState): void {
  const resolved = resolveActiveDisplay(state.equipment, catalog);
  const title = document.createElement('div');
  title.className = 'nav-section-title';
  title.textContent = 'ANALYZE DISPLAY';
  body.appendChild(title);

  if (resolved.kind === 'none') {
    note(body, 'Place a display to run viewing analysis.');
    return;
  }
  if (resolved.kind === 'incomplete') {
    const warn = document.createElement('div');
    warn.className = 'badge-note';
    warn.style.color = 'var(--warning)';
    warn.textContent = `DATA INCOMPLETE — ${resolved.reason}`;
    body.appendChild(warn);
    return;
  }

  const obstacles = projectObstacles(state.room, state.tables);
  const display = resolved.placement;
  const summary = summarizeDesignHealth(state.seats, display, obstacles);
  const health = viewingHealthFromSummary(summary, true);
  const analyses = analyzeAllSeatsAgainstDisplay(state.seats, display, obstacles);

  const cov = document.createElement('div');
  cov.className = 'analysis-summary';
  cov.innerHTML = `
    <div class="analysis-hero">Viewing Coverage<br><b>${summary.passCount} / ${summary.totalSeats} seats</b> pass guidance</div>
    <div class="analysis-counts">
      <span class="status-pill pass">PASS ${summary.passCount}</span>
      <span class="status-pill warning">WARNING ${summary.warningCount}</span>
      <span class="status-pill fail">FAIL ${summary.failCount}</span>
    </div>
  `;
  body.appendChild(cov);

  const healthRow = document.createElement('div');
  healthRow.className = 'badge-note';
  healthRow.textContent = `Viewing (Design Health foundation): ${health.status.toUpperCase()} — counts only, not a scored percentage. Engineering estimate, not AVIXA DISCAS compliance.`;
  body.appendChild(healthRow);

  const viz = state.displayAnalysis;
  const enableBtn = document.createElement('button');
  enableBtn.className = viz.enabled ? 'btn' : 'btn primary';
  enableBtn.textContent = viz.enabled ? 'Hide analysis overlays' : 'Analyze Display';
  enableBtn.onclick = () => {
    if (viz.enabled) state.disableDisplayAnalysis();
    else state.enableDisplayAnalysis();
  };
  body.appendChild(enableBtn);

  if (!viz.enabled) {
    note(body, 'Overlays stay off until you analyze. Calculations still run for this summary.');
    return;
  }

  toggleRow(body, 'Seat status', viz.seatStatus, (on) => state.setDisplayAnalysisView({ seatStatus: on }));
  toggleRow(body, 'Viewing heatmap', viz.heatmap, (on) => state.setDisplayAnalysisView({ heatmap: on }));

  const sl = document.createElement('div');
  sl.className = 'field';
  const slLabel = document.createElement('label');
  slLabel.textContent = 'Sightlines';
  const slSelect = document.createElement('select');
  ([['off', 'Off'], ['selected', 'Selected seat'], ['all', 'All seats']] as const).forEach(([val, lab]) => {
    const o = document.createElement('option');
    o.value = val;
    o.textContent = lab;
    if (viz.sightlines === val) o.selected = true;
    slSelect.appendChild(o);
  });
  slSelect.onchange = () => state.setDisplayAnalysisView({ sightlines: slSelect.value as AppState['displayAnalysis']['sightlines'] });
  sl.append(slLabel, slSelect);
  body.appendChild(sl);

  const samp = document.createElement('div');
  samp.className = 'field';
  const sampLabel = document.createElement('label');
  sampLabel.textContent = 'Heatmap sampling';
  const sampSelect = document.createElement('select');
  ([['standard', 'Standard'], ['high', 'High']] as const).forEach(([val, lab]) => {
    const o = document.createElement('option');
    o.value = val;
    o.textContent = lab;
    if (viz.samplingQuality === val) o.selected = true;
    sampSelect.appendChild(o);
  });
  sampSelect.onchange = () =>
    state.setDisplayAnalysisView({ samplingQuality: sampSelect.value as AppState['displayAnalysis']['samplingQuality'] });
  samp.append(sampLabel, sampSelect);
  body.appendChild(samp);

  const viewerBtn = document.createElement('button');
  viewerBtn.className = 'btn';
  viewerBtn.textContent = 'Viewer Mode (selected / first seat)';
  viewerBtn.onclick = () => {
    const id = state.selection.kind === 'seat' && state.selection.id ? state.selection.id : state.seats[0]?.id;
    if (id) state.enterViewerMode(id);
  };
  body.appendChild(viewerBtn);

  const detailsBtn = document.createElement('button');
  detailsBtn.className = 'btn';
  detailsBtn.textContent = viz.detailsOpen ? 'Hide details' : 'Details';
  detailsBtn.onclick = () => state.setDisplayAnalysisView({ detailsOpen: !viz.detailsOpen });
  body.appendChild(detailsBtn);

  if (viz.detailsOpen) {
    analyses.forEach((a) => {
      const row = document.createElement('div');
      row.className = 'seat-analysis-row';
      row.onclick = () => state.select('seat', a.seatId);
      row.innerHTML = `<b>${a.seatId}</b> <span class="status-pill ${a.overall}">${a.overall.toUpperCase()}</span>
        <span class="muted">${a.distance.value} m · H ${a.horizontalAngle.value}° · V ${a.verticalAngle.value}°</span>`;
      body.appendChild(row);
    });
    note(
      body,
      'Distance uses an image-height multiplier heuristic (commonly cited 4:6:8-style planning check), labeled engineering_estimate. Horizontal/vertical angles and obstruction are geometric calculations. Official AVIXA DISCAS is not claimed.'
    );
  }
}

function toggleRow(body: HTMLElement, label: string, on: boolean, set: (v: boolean) => void): void {
  const row = document.createElement('label');
  row.className = 'toggle-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = on;
  input.onchange = () => set(input.checked);
  row.append(input, document.createTextNode(' ' + label));
  body.appendChild(row);
}

function note(body: HTMLElement, text: string): void {
  const el = document.createElement('div');
  el.className = 'badge-note';
  el.textContent = text;
  body.appendChild(el);
}

export function renderAnalyzeStep(container: HTMLElement, state: AppState): void {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  renderDisplayAnalysisControls(wrap, state);
  renderMicAnalysisControls(wrap, state);
  renderAudioAnalysisControls(wrap, state);
  renderCameraAnalysisControls(wrap, state);
  container.appendChild(wrap);
}
