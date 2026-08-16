/**
 * AudioAnalysisPanel.ts
 * AUDIO ANALYSIS — SpeakerCoverageEngine results only.
 */

import type { AppState } from '../../app/AppState';
import { AUDIO_METHOD, SPL_TARGET_MIN, SPL_TARGET_MAX } from '../../av/SpeakerCoverageEngine';
import { resolveProjectSpeakers, summarizeSpeakerCoverage } from '../../av/SpeakerAnalysis';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';

const catalog = loadDefaultCatalog();

export function renderAudioAnalysisControls(body: HTMLElement, state: AppState): void {
  const resolved = resolveProjectSpeakers(state.equipment, catalog);
  const title = document.createElement('div');
  title.className = 'nav-section-title';
  title.textContent = 'AUDIO ANALYSIS';
  body.appendChild(title);

  if (resolved.length === 0) {
    note(body, 'Place a catalog speaker to run coverage / SPL estimates.');
    return;
  }

  const incomplete = resolved.filter((s) => s.incomplete);
  if (incomplete.length) {
    const warn = document.createElement('div');
    warn.className = 'badge-note';
    warn.style.color = 'var(--warning)';
    warn.textContent = `DATA INCOMPLETE — ${incomplete.map((s) => s.incompleteReason).join(' ')}`;
    body.appendChild(warn);
  }

  const usable = resolved.filter((s) => !s.incomplete);
  if (usable.length === 0) return;

  const summary = summarizeSpeakerCoverage(state.seats, state.equipment, catalog);
  const cov = document.createElement('div');
  cov.className = 'analysis-summary';
  cov.innerHTML = `
    <div class="analysis-hero">Speaker coverage<br><b>${summary.coveredSeats} / ${summary.totalSeats} seats</b> meet ${SPL_TARGET_MIN}–${SPL_TARGET_MAX} dB (engineering estimate)</div>
    <div class="analysis-counts">
      <span class="status-pill pass">PASS ${summary.coveredSeats}</span>
      <span class="status-pill fail">OUTSIDE/BELOW ${summary.totalSeats - summary.coveredSeats}</span>
    </div>
  `;
  body.appendChild(cov);

  if (summary.totalSeats > 0) {
    note(body, `Coverage (calculated): ${summary.coveragePct}% of seats with status PASS. Not an optimization score.`);
  }

  usable.forEach((s) => {
    const product = catalog.get(s.productId);
    const box = document.createElement('div');
    box.className = 'badge-note';
    box.innerHTML = `<b>Speaker</b> ${product?.manufacturer ?? ''} ${product?.model ?? s.name}<br>
      <b>MODEL</b> Engineering estimate (free-field + catalog dispersion)<br>
      <b>SOURCE</b> Catalog maxSplAt1m ${s.maxSplAt1m} dB @ 1 m; dispersion from catalog; height/facing from placement<br>
      <b>ASSUMPTIONS</b> ${AUDIO_METHOD}<br>
      <b>Threshold</b> ${SPL_TARGET_MIN}–${SPL_TARGET_MAX} dB SPL`;
    body.appendChild(box);
  });

  const viz = state.audioAnalysis;
  const enableBtn = document.createElement('button');
  enableBtn.className = viz.enabled ? 'btn' : 'btn primary';
  enableBtn.textContent = viz.enabled ? 'Hide speaker overlays' : 'Analyze Coverage';
  enableBtn.onclick = () => {
    if (viz.enabled) state.disableAudioAnalysis();
    else state.enableAudioAnalysis();
  };
  body.appendChild(enableBtn);

  if (!viz.enabled) {
    note(body, 'Overlays stay off until you analyze. Seat counts above already use SpeakerCoverageEngine.');
    return;
  }

  toggleRow(body, 'Seat status', viz.seatStatus, (on) => state.setAudioAnalysisView({ seatStatus: on }));
  toggleRow(body, 'Coverage region', viz.coverageRegions, (on) => state.setAudioAnalysisView({ coverageRegions: on }));
  toggleRow(body, 'SPL / coverage heatmap', viz.heatmap, (on) => state.setAudioAnalysisView({ heatmap: on }));

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
    state.setAudioAnalysisView({ samplingQuality: sampSelect.value as AppState['audioAnalysis']['samplingQuality'] });
  samp.append(sampLabel, sampSelect);
  body.appendChild(samp);

  const detailsBtn = document.createElement('button');
  detailsBtn.className = 'btn';
  detailsBtn.textContent = viz.detailsOpen ? 'Hide details' : 'Details';
  detailsBtn.onclick = () => state.setAudioAnalysisView({ detailsOpen: !viz.detailsOpen });
  body.appendChild(detailsBtn);

  if (viz.detailsOpen) {
    summary.seatResults.forEach((a) => {
      const row = document.createElement('div');
      row.className = 'seat-analysis-row';
      row.onclick = () => state.select('seat', a.seatId);
      row.innerHTML = `<b>${a.seatId}</b> <span class="status-pill ${a.status}">${a.status.toUpperCase()}</span>
        <span class="muted">${a.splAtSeat != null ? `${a.splAtSeat} dB` : 'DATA INCOMPLETE / outside dispersion'} · ${a.distanceM ?? '—'} m · zone ${a.zone}</span>`;
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
