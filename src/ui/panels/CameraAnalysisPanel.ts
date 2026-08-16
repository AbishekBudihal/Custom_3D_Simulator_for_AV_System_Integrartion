/**
 * CameraAnalysisPanel.ts
 * CAMERA COVERAGE — CameraCoverageEngine geometric frustum estimate.
 */

import type { AppState } from '../../app/AppState';
import { CAMERA_METHOD } from '../../av/CameraCoverageEngine';
import { resolveProjectCameras, summarizeCameraCoverage } from '../../av/CameraAnalysis';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';

const catalog = loadDefaultCatalog();

export function renderCameraAnalysisControls(body: HTMLElement, state: AppState): void {
  const resolved = resolveProjectCameras(state.equipment, catalog);
  const title = document.createElement('div');
  title.className = 'nav-section-title';
  title.textContent = 'CAMERA COVERAGE';
  body.appendChild(title);

  if (resolved.length === 0) {
    note(body, 'Place a catalog camera to run geometric frustum coverage.');
    return;
  }

  const incomplete = resolved.filter((c) => c.incomplete);
  if (incomplete.length) {
    const warn = document.createElement('div');
    warn.className = 'badge-note';
    warn.style.color = 'var(--warning)';
    warn.textContent = `DATA INCOMPLETE — ${incomplete.map((c) => c.incompleteReason).join(' ')}`;
    body.appendChild(warn);
  }

  const usable = resolved.filter((c) => !c.incomplete);
  if (usable.length === 0) return;

  const summary = summarizeCameraCoverage(state.seats, state.equipment, catalog, state.room, state.tables);
  const cov = document.createElement('div');
  cov.className = 'analysis-summary';
  cov.innerHTML = `
    <div class="analysis-hero">Geometric frustum estimate<br><b>${summary.visibleSeats} / ${summary.totalSeats} seats</b> visible (union)</div>
    <div class="analysis-counts">
      <span class="status-pill pass">VISIBLE ${summary.visibleSeats}</span>
      <span class="status-pill warning">BLOCKED ${summary.blockedSeats}</span>
      <span class="status-pill fail">OUTSIDE FOV ${summary.outsideFovSeats}</span>
    </div>
  `;
  body.appendChild(cov);

  if (summary.totalSeats > 0) {
    note(body, `Coverage (calculated): ${summary.coveragePct}% of seats visible. Union of cameras. Not image-quality scoring.`);
  }

  usable.forEach((c) => {
    const product = catalog.get(c.productId);
    const vfov =
      c.verticalFovDeg != null
        ? `${c.verticalFovDeg}° VFOV (catalog)`
        : 'VFOV not in catalog — horizontal-only (not invented)';
    const box = document.createElement('div');
    box.className = 'badge-note';
    box.innerHTML = `<b>Camera</b> ${product?.manufacturer ?? ''} ${product?.model ?? c.name}<br>
      <b>MODEL</b> Geometric frustum estimate<br>
      <b>SOURCE</b> Catalog horizontalFovDeg ${c.horizontalFovDeg}°; ${vfov}; pose from placement<br>
      <b>ASSUMPTIONS</b> ${CAMERA_METHOD}`;
    body.appendChild(box);
  });

  const viz = state.cameraAnalysis;
  const enableBtn = document.createElement('button');
  enableBtn.className = viz.enabled ? 'btn' : 'btn primary';
  enableBtn.textContent = viz.enabled ? 'Hide camera overlays' : 'Camera Coverage';
  enableBtn.onclick = () => {
    if (viz.enabled) state.disableCameraAnalysis();
    else state.enableCameraAnalysis();
  };
  body.appendChild(enableBtn);

  if (!viz.enabled) {
    note(body, 'Overlays stay off until you analyze. Seat counts above already use CameraCoverageEngine.');
    return;
  }

  toggleRow(body, 'Seat status', viz.seatStatus, (on) => state.setCameraAnalysisView({ seatStatus: on }));
  toggleRow(body, 'FOV region', viz.fovRegions, (on) => state.setCameraAnalysisView({ fovRegions: on }));
  toggleRow(body, 'Blocked sightlines', viz.blockedSightlines, (on) =>
    state.setCameraAnalysisView({ blockedSightlines: on })
  );
  toggleRow(body, 'Coverage heatmap', viz.heatmap, (on) => state.setCameraAnalysisView({ heatmap: on }));

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
    state.setCameraAnalysisView({ samplingQuality: sampSelect.value as AppState['cameraAnalysis']['samplingQuality'] });
  samp.append(sampLabel, sampSelect);
  body.appendChild(samp);

  const detailsBtn = document.createElement('button');
  detailsBtn.className = 'btn';
  detailsBtn.textContent = viz.detailsOpen ? 'Hide details' : 'Details';
  detailsBtn.onclick = () => state.setCameraAnalysisView({ detailsOpen: !viz.detailsOpen });
  body.appendChild(detailsBtn);

  if (viz.detailsOpen) {
    summary.seatResults.forEach((a) => {
      const row = document.createElement('div');
      row.className = 'seat-analysis-row';
      row.onclick = () => state.select('seat', a.seatId);
      const cams = a.visible
        ? a.coveringCameraIds.join(', ')
        : a.inFov
          ? a.blockingCameraIds.join(', ')
          : 'none';
      row.innerHTML = `<b>${a.seatId}</b> <span class="status-pill ${a.status}">${a.status.toUpperCase()}</span>
        <span class="muted">FOV ${a.inFov ? 'PASS' : 'FAIL'} · sightline ${a.sightline} · cam ${cams}</span>`;
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
