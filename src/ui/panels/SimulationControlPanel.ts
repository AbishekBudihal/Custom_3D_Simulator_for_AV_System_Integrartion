/**
 * SimulationControlPanel.ts
 * Shared SIMULATE controls. Overlays stay off until the user enables them.
 */

import type { AppState } from '../../app/AppState';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';

const catalog = loadDefaultCatalog();

export function renderSimulationControlPanel(container: HTMLElement, state: AppState): void {
  container.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'nav-section-title';
  title.textContent = 'SIMULATE';
  container.appendChild(title);

  const note = document.createElement('div');
  note.className = 'badge-note';
  note.textContent =
    'Geometric / engineering estimates only. Heatmaps stay off until enabled. One heatmap layer at a time.';
  container.appendChild(note);

  const cats = new Set(state.equipment.map((e) => catalog.get(e.productId)?.category));

  if (cats.has('display')) {
    const d = state.displayAnalysis;
    const liveSeat = d.enabled && d.seatStatus;
    const liveSight = d.enabled && d.sightlines !== 'off';
    const liveHeat = d.enabled && d.heatmap;
    domain(container, 'Display', [
      ['Seat status', liveSeat, (on) => {
        state.setDisplayAnalysisView({
          enabled: on || liveSight || liveHeat,
          seatStatus: on,
          heatmap: liveHeat,
          sightlines: liveSight ? d.sightlines : 'off'
        });
      }],
      ['Sightlines (selected)', liveSight, (on) => {
        state.setDisplayAnalysisView({
          enabled: on || liveSeat || liveHeat,
          seatStatus: liveSeat,
          heatmap: liveHeat,
          sightlines: on ? 'selected' : 'off'
        });
      }],
      ['Heatmap', liveHeat, (on) => {
        state.setDisplayAnalysisView({
          enabled: on || liveSeat || liveSight,
          seatStatus: liveSeat,
          heatmap: on,
          sightlines: liveSight ? d.sightlines : 'off'
        });
      }]
    ]);
  } else {
    emptyHint(container, 'No display placed', 'Add a catalog display to run viewing analysis.');
  }

  if (cats.has('microphone')) {
    const m = state.micAnalysis;
    const livePickup = m.enabled && m.pickupRegions;
    const liveSeat = m.enabled && m.seatStatus;
    const liveHeat = m.enabled && m.heatmap;
    domain(container, 'Microphone', [
      ['Pickup region', livePickup, (on) => {
        state.setMicAnalysisView({ enabled: on || liveSeat || liveHeat, pickupRegions: on, seatStatus: liveSeat, heatmap: liveHeat });
      }],
      ['Seat status', liveSeat, (on) => {
        state.setMicAnalysisView({ enabled: on || livePickup || liveHeat, pickupRegions: livePickup, seatStatus: on, heatmap: liveHeat });
      }],
      ['Heatmap', liveHeat, (on) => {
        state.setMicAnalysisView({ enabled: on || livePickup || liveSeat, pickupRegions: livePickup, seatStatus: liveSeat, heatmap: on });
      }]
    ]);
  } else {
    emptyHint(container, 'No microphone placed', 'Add a catalog microphone to begin pickup analysis.');
  }

  if (cats.has('speaker')) {
    const a = state.audioAnalysis;
    const liveCov = a.enabled && a.coverageRegions;
    const liveSeat = a.enabled && a.seatStatus;
    const liveHeat = a.enabled && a.heatmap;
    domain(container, 'Speaker', [
      ['Coverage region', liveCov, (on) => {
        state.setAudioAnalysisView({ enabled: on || liveSeat || liveHeat, coverageRegions: on, seatStatus: liveSeat, heatmap: liveHeat });
      }],
      ['Seat status / SPL', liveSeat, (on) => {
        state.setAudioAnalysisView({ enabled: on || liveCov || liveHeat, coverageRegions: liveCov, seatStatus: on, heatmap: liveHeat });
      }],
      ['Heatmap', liveHeat, (on) => {
        state.setAudioAnalysisView({ enabled: on || liveCov || liveSeat, coverageRegions: liveCov, seatStatus: liveSeat, heatmap: on });
      }]
    ]);
  } else {
    emptyHint(container, 'No speaker placed', 'Add a catalog speaker to estimate coverage / SPL.');
  }

  if (cats.has('camera')) {
    const c = state.cameraAnalysis;
    const liveFov = c.enabled && c.fovRegions;
    const liveBlock = c.enabled && c.blockedSightlines;
    const liveHeat = c.enabled && c.heatmap;
    domain(container, 'Camera', [
      ['FOV region', liveFov, (on) => {
        state.setCameraAnalysisView({
          enabled: on || liveBlock || liveHeat,
          fovRegions: on,
          blockedSightlines: liveBlock,
          heatmap: liveHeat
        });
      }],
      ['Blocked sightlines', liveBlock, (on) => {
        state.setCameraAnalysisView({
          enabled: on || liveFov || liveHeat,
          fovRegions: liveFov,
          blockedSightlines: on,
          heatmap: liveHeat
        });
      }],
      ['Heatmap', liveHeat, (on) => {
        state.setCameraAnalysisView({
          enabled: on || liveFov || liveBlock,
          fovRegions: liveFov,
          blockedSightlines: liveBlock,
          heatmap: on
        });
      }]
    ]);
  } else {
    emptyHint(container, 'No camera placed', 'Add a catalog camera with horizontal FOV to run frustum coverage.');
  }
}

function domain(
  container: HTMLElement,
  title: string,
  rows: Array<[string, boolean, (on: boolean) => void]>
): void {
  const h = document.createElement('div');
  h.className = 'nav-section-title';
  h.textContent = title;
  container.appendChild(h);
  rows.forEach(([label, on, set]) => {
    const row = document.createElement('label');
    row.className = 'toggle-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = on;
    input.onchange = () => set(input.checked);
    row.append(input, document.createTextNode(' ' + label));
    container.appendChild(row);
  });
}

function emptyHint(container: HTMLElement, title: string, body: string): void {
  const box = document.createElement('div');
  box.className = 'empty-state';
  box.innerHTML = `<div class="empty-title">${title}</div><div class="empty-body">${body}</div>`;
  container.appendChild(box);
}
