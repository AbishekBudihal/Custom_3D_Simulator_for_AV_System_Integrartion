/**
 * ElevationRenderer.ts
 * Side elevation (§9): height (Y) vs. ground distance from the
 * display wall (Z), so the person can see WHY a seat passes or
 * fails — mount height, eye height, and the resulting vertical
 * angle, drawn as real geometry, not the ASCII mockup shape.
 * Uses the same DesignAnalysis helpers as Plan/3D/Inspector.
 */

import type { AppState } from '../../app/AppState';
import { getActiveDisplay, analyzeSeatAgainstDisplay, DEFAULT_EYE_HEIGHT_M, projectObstacles } from '../../av/DesignAnalysis';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';

const catalog = loadDefaultCatalog();
const PX_PER_M = 70;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

export function renderElevationView(container: HTMLElement, state: AppState): void {
  container.innerHTML = '';
  const room = state.room;
  if (!room) {
    const empty = document.createElement('div');
    empty.className = 'plan-empty';
    empty.textContent = 'Define a room to see the elevation.';
    container.appendChild(empty);
    return;
  }

  const display = getActiveDisplay(state.equipment, catalog);
  if (!display) {
    renderElevationWithoutDisplay(container, state, room);
    return;
  }

  const obstacles = projectObstacles(room, state.tables);
  let focusSeatId = state.selection.kind === 'seat' ? state.selection.id : null;
  if (!focusSeatId && state.seats.length) {
    const ranked = state.seats
      .map((s) => ({ id: s.id, analysis: analyzeSeatAgainstDisplay(display, s, obstacles) }))
      .sort((a, b) => rank(b.analysis.overall) - rank(a.analysis.overall));
    focusSeatId = ranked[0]?.id ?? null;
  }
  const focusSeat = state.seats.find((s) => s.id === focusSeatId) ?? null;
  const analysis = focusSeat ? analyzeSeatAgainstDisplay(display, focusSeat, obstacles) : null;

  const wallHeightPx = room.height * PX_PER_M;
  const groundDistM = analysis ? analysis.distance.value : Math.max(3, room.depth * 0.6);
  const distPx = groundDistM * PX_PER_M;
  const padPx = 90;
  const svgWidth = distPx + padPx * 2;
  const svgHeight = wallHeightPx + padPx * 1.4;

  const svg = svgEl('svg', { width: '100%', height: '100%', viewBox: `${-padPx * 0.6} ${-40} ${svgWidth} ${svgHeight}` });
  svg.style.background = '#eceae6';

  const wallX = 0;
  const floorY = wallHeightPx;

  // Floor
  svg.appendChild(svgEl('line', { x1: wallX, y1: floorY, x2: distPx + padPx, y2: floorY, stroke: '#2a2b2f', 'stroke-width': 3 }));
  // Wall
  svg.appendChild(svgEl('line', { x1: wallX, y1: 0, x2: wallX, y2: floorY, stroke: '#2a2b2f', 'stroke-width': 4 }));
  // Ceiling (dashed)
  svg.appendChild(svgEl('line', { x1: wallX, y1: 0, x2: distPx + padPx, y2: 0, stroke: '#9a978f', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));

  // Display, mounted at its real height
  const dispHeightPx = display.heightM * PX_PER_M;
  const dispCenterY = floorY - display.position.y * PX_PER_M;
  const dispTopY = dispCenterY - dispHeightPx / 2;
  svg.appendChild(
    svgEl('rect', { x: wallX + 2, y: dispTopY, width: 10, height: dispHeightPx, fill: '#0d3a5c', stroke: '#000', 'stroke-width': 1 })
  );
  const dispLabel = svgEl('text', { x: wallX + 20, y: dispCenterY, 'font-size': 11, fill: '#232427', 'dominant-baseline': 'middle' });
  dispLabel.textContent = `${display.diagonalInches}" display · mounted ${display.position.y.toFixed(2)}m AFF`;
  svg.appendChild(dispLabel);

  // Height dimension line for the display
  svg.appendChild(dimLine(wallX - 22, dispTopY, wallX - 22, dispTopY + dispHeightPx, `${display.heightM.toFixed(2)}m`, true));

  if (focusSeat && analysis) {
    const eyeY = floorY - DEFAULT_EYE_HEIGHT_M * PX_PER_M;
    const seatX = distPx;

    // Sightline from eye to display center
    const sightColor = analysis.overall === 'pass' ? '#2fae5a' : analysis.overall === 'warning' ? '#e0a934' : '#d6483f';
    svg.appendChild(svgEl('line', { x1: seatX, y1: eyeY, x2: wallX + 7, y2: dispCenterY, stroke: sightColor, 'stroke-width': 2 }));

    // Viewer figure (simple head + body)
    svg.appendChild(svgEl('circle', { cx: seatX, cy: eyeY - 12, r: 8, fill: '#2b3a55' }));
    svg.appendChild(svgEl('line', { x1: seatX, y1: eyeY - 4, x2: seatX, y2: floorY - 4, stroke: '#2b3a55', 'stroke-width': 5 }));

    // Eye-height dimension
    svg.appendChild(dimLine(seatX + 24, eyeY, seatX + 24, floorY, `${DEFAULT_EYE_HEIGHT_M.toFixed(2)}m eye ht.`, true));

    // Ground distance dimension
    svg.appendChild(dimLine(wallX, floorY + 26, seatX, floorY + 26, `${groundDistM.toFixed(2)}m`, false));

    // Vertical angle label near the sightline midpoint
    const midX = (seatX + wallX) / 2;
    const midY = (eyeY + dispCenterY) / 2;
    const angleLabel = svgEl('text', {
      x: midX, y: midY - 8, 'text-anchor': 'middle', 'font-size': 11, fill: sightColor, 'font-weight': 700
    });
    angleLabel.textContent = `${Math.abs(analysis.verticalAngle.value).toFixed(1)}° vertical · ${analysis.overall.toUpperCase()}`;
    svg.appendChild(angleLabel);

    const seatTag = svgEl('text', { x: seatX, y: floorY + 42, 'text-anchor': 'middle', 'font-size': 10, fill: '#6f747c' });
    seatTag.textContent = `Seat ${focusSeat.id}`;
    svg.appendChild(seatTag);
  }

  if (state.selection.kind === 'equipment' && state.selection.id) {
    const inst = state.equipment.find((e) => e.instanceId === state.selection.id);
    const product = inst ? catalog.get(inst.productId) : null;
    if (inst && product && product.category !== 'display') {
      const yPx = floorY - inst.position.y * PX_PER_M;
      svg.appendChild(svgEl('circle', { cx: wallX + 18, cy: yPx, r: 4, fill: '#2f8cff' }));
      const tag = svgEl('text', { x: wallX + 28, y: yPx, 'font-size': 11, fill: '#232427', 'dominant-baseline': 'middle' });
      tag.textContent = `${product.category} · ${inst.position.y.toFixed(2)}m AFF`;
      svg.appendChild(tag);
    }
  }

  container.appendChild(svg);
}

function renderElevationWithoutDisplay(container: HTMLElement, state: AppState, room: NonNullable<AppState['room']>): void {
  const wallHeightPx = room.height * PX_PER_M;
  const distPx = Math.max(3, room.depth * 0.6) * PX_PER_M;
  const padPx = 90;
  const svgWidth = distPx + padPx * 2;
  const svgHeight = wallHeightPx + padPx * 1.4;
  const svg = svgEl('svg', { width: '100%', height: '100%', viewBox: `${-padPx * 0.6} ${-40} ${svgWidth} ${svgHeight}` });
  svg.style.background = '#eceae6';
  const wallX = 0;
  const floorY = wallHeightPx;
  svg.appendChild(svgEl('line', { x1: wallX, y1: floorY, x2: distPx + padPx, y2: floorY, stroke: '#2a2b2f', 'stroke-width': 3 }));
  svg.appendChild(svgEl('line', { x1: wallX, y1: 0, x2: wallX, y2: floorY, stroke: '#2a2b2f', 'stroke-width': 4 }));
  svg.appendChild(svgEl('line', { x1: wallX, y1: 0, x2: distPx + padPx, y2: 0, stroke: '#9a978f', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
  const hint = svgEl('text', { x: wallX + 20, y: 24, 'font-size': 11, fill: '#6f747c' });
  hint.textContent = 'No display — sightline elevation unavailable. Selected AV height still shown.';
  svg.appendChild(hint);
  if (state.selection.kind === 'equipment' && state.selection.id) {
    const inst = state.equipment.find((e) => e.instanceId === state.selection.id);
    const product = inst ? catalog.get(inst.productId) : null;
    if (inst && product) {
      const yPx = floorY - inst.position.y * PX_PER_M;
      svg.appendChild(svgEl('circle', { cx: wallX + 18, cy: yPx, r: 4, fill: '#2f8cff' }));
      const tag = svgEl('text', { x: wallX + 28, y: yPx, 'font-size': 11, fill: '#232427', 'dominant-baseline': 'middle' });
      tag.textContent = `${product.category} · ${inst.position.y.toFixed(2)}m AFF`;
      svg.appendChild(tag);
    }
  }
  container.appendChild(svg);
}

function rank(status: 'pass' | 'warning' | 'fail'): number {
  return status === 'fail' ? 2 : status === 'warning' ? 1 : 0;
}

function dimLine(x1: number, y1: number, x2: number, y2: number, label: string, vertical: boolean): SVGGElement {
  const g = svgEl('g');
  g.appendChild(svgEl('line', { x1, y1, x2, y2, stroke: '#6f747c', 'stroke-width': 1 }));
  const text = svgEl('text', {
    x: vertical ? x1 - 6 : (x1 + x2) / 2,
    y: vertical ? (y1 + y2) / 2 : y1 + 14,
    'text-anchor': vertical ? 'end' : 'middle',
    'font-size': 10,
    fill: '#4a4d52'
  });
  text.textContent = label;
  g.appendChild(text);
  return g;
}
