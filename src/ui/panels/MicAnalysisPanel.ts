/**
 * MicAnalysisPanel.ts
 * Contextual ANALYZE MICROPHONE UI. Coverage from MicrophoneCoverageEngine.
 */

import type { AppState } from '../../app/AppState';
import { modelLabel, resolveProjectMicrophones, summarizeMicCoverage } from '../../av/MicAnalysis';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';

const catalog = loadDefaultCatalog();

export function renderMicAnalysisControls(body: HTMLElement, state: AppState): void {
  const resolved = resolveProjectMicrophones(state.equipment, catalog);
  const title = document.createElement('div');
  title.className = 'nav-section-title';
  title.textContent = 'ANALYZE MICROPHONE';
  body.appendChild(title);

  if (resolved.length === 0) {
    note(body, 'Place a catalog microphone to run pickup coverage.');
    return;
  }

  const incomplete = resolved.filter((m) => m.incomplete);
  if (incomplete.length) {
    const warn = document.createElement('div');
    warn.className = 'badge-note';
    warn.style.color = 'var(--warning)';
    warn.textContent = `DATA INCOMPLETE — ${incomplete.map((m) => m.incompleteReason).join(' ')}`;
    body.appendChild(warn);
  }

  const usable = resolved.filter((m) => !m.incomplete);
  if (usable.length === 0) return;

  const summary = summarizeMicCoverage(state.seats, state.equipment, catalog);

  const cov = document.createElement('div');
  cov.className = 'analysis-summary';
  cov.innerHTML = `
    <div class="analysis-hero">Pickup coverage<br><b>${summary.coveredSeats} / ${summary.totalSeats} seats</b> inside calculated region</div>
    <div class="analysis-counts">
      <span class="status-pill pass">INSIDE ${summary.coveredSeats}</span>
      <span class="status-pill fail">OUTSIDE ${summary.uncoveredSeats.length}</span>
    </div>
  `;
  body.appendChild(cov);

  usable.forEach((m) => {
    const meta = m.pickupRegion?.metadata;
    const box = document.createElement('div');
    box.className = 'badge-note';
    box.innerHTML = `<b>MODEL</b> ${modelLabel(m.coverageModel)}<br><b>SOURCE</b> ${meta?.source ?? 'Catalog/project data'}<br><b>ASSUMPTIONS</b> ${meta?.assumptions ?? ''}`;
    body.appendChild(box);
  });

  const viz = state.micAnalysis;
  const enableBtn = document.createElement('button');
  enableBtn.className = viz.enabled ? 'btn' : 'btn primary';
  enableBtn.textContent = viz.enabled ? 'Hide microphone overlays' : 'Analyze Pickup';
  enableBtn.onclick = () => {
    if (viz.enabled) state.disableMicAnalysis();
    else state.enableMicAnalysis();
  };
  body.appendChild(enableBtn);

  if (!viz.enabled) {
    note(body, 'Overlays stay off until you analyze. Seat counts above already use the coverage engine.');
    return;
  }

  toggleRow(body, 'Seat status', viz.seatStatus, (on) => state.setMicAnalysisView({ seatStatus: on }));
  toggleRow(body, 'Pickup region', viz.pickupRegions, (on) => state.setMicAnalysisView({ pickupRegions: on }));
  toggleRow(body, 'Pickup heatmap', viz.heatmap, (on) => state.setMicAnalysisView({ heatmap: on }));

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
    state.setMicAnalysisView({ samplingQuality: sampSelect.value as AppState['micAnalysis']['samplingQuality'] });
  samp.append(sampLabel, sampSelect);
  body.appendChild(samp);

  const detailsBtn = document.createElement('button');
  detailsBtn.className = 'btn';
  detailsBtn.textContent = viz.detailsOpen ? 'Hide details' : 'Details';
  detailsBtn.onclick = () => state.setMicAnalysisView({ detailsOpen: !viz.detailsOpen });
  body.appendChild(detailsBtn);

  if (viz.detailsOpen) {
    summary.seatResults.forEach((a) => {
      const row = document.createElement('div');
      row.className = 'seat-analysis-row';
      row.onclick = () => state.select('seat', a.seatId);
      const ang = a.angularDeltaDeg != null ? ` · ${a.angularDeltaDeg}°` : '';
      row.innerHTML = `<b>${a.seatId}</b> <span class="status-pill ${a.status}">${a.status.toUpperCase()}</span>
        <span class="muted">${a.covered ? 'inside' : 'outside'} · ${a.nearestDistanceM ?? '—'} m${ang}</span>`;
      body.appendChild(row);
    });
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
