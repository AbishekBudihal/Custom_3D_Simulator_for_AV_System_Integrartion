import type { AppState } from '../../app/AppState';
import { analyzeSeatAgainstDisplay, getActiveDisplay } from '../../av/DesignAnalysis';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';

const catalog = loadDefaultCatalog();

/** Renders (or clears) the Viewer Mode HUD into `container`, which lives inside the viewport-wrap overlay layer. */
export function renderViewerModeOverlay(container: HTMLElement, state: AppState): void {
  container.innerHTML = '';
  const vm = state.viewerMode;
  if (!vm.active || !vm.seatId) return;

  const seat = state.seats.find((s) => s.id === vm.seatId);
  if (!seat) return;

  const panel = document.createElement('div');
  panel.className = 'viewer-mode-panel';

  const title = document.createElement('div');
  title.className = 'vm-title';
  title.textContent = 'VIEWER MODE';
  panel.appendChild(title);

  const seatLabel = document.createElement('div');
  seatLabel.className = 'vm-seat';
  seatLabel.textContent = `Seat ${seat.id}`;
  panel.appendChild(seatLabel);

  const displayInstance = state.equipment.find((e) => catalog.get(e.productId)?.category === 'display');
  if (!displayInstance) {
    const empty = document.createElement('div');
    empty.className = 'vm-row';
    empty.textContent = 'No display placed yet.';
    panel.appendChild(empty);
  } else {
    const display = getActiveDisplay(state.equipment, catalog)!;
    const analysis = analyzeSeatAgainstDisplay(display, seat);

    const rows: [string, string][] = [
      ['Distance', `${analysis.distance.value} m`],
      ['Horizontal', `${analysis.horizontalAngle.value}°`],
      ['Vertical', `${analysis.verticalAngle.value}°`]
    ];
    rows.forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'vm-row';
      row.innerHTML = `<span>${label}</span><b>${value}</b>`;
      panel.appendChild(row);
    });

    const status = document.createElement('div');
    status.className = `vm-status status-pill ${analysis.overall}`;
    status.textContent = `VIEWING ${analysis.overall.toUpperCase()}`;
    panel.appendChild(status);
  }

  const nav = document.createElement('div');
  nav.className = 'viewer-mode-nav';
  const prev = document.createElement('button');
  prev.textContent = '◀ Prev';
  prev.onclick = () => state.stepViewerSeat(-1);
  const next = document.createElement('button');
  next.textContent = 'Next ▶';
  next.onclick = () => state.stepViewerSeat(1);
  const exit = document.createElement('button');
  exit.textContent = 'Exit';
  exit.className = 'exit';
  exit.onclick = () => state.exitViewerMode();
  nav.append(prev, next, exit);
  panel.appendChild(nav);

  container.appendChild(panel);
}
