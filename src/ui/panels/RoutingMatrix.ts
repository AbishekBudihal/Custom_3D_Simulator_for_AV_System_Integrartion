/**
 * RoutingMatrix.ts
 * Catalog-derived switcher matrix. No fake I/O counts.
 */

import type { AppState } from '../../app/AppState';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';
import { isRoutableProduct, matrixPorts, routeForOutput } from '../../system/SystemRouting';

const catalog = loadDefaultCatalog();

export function renderRoutingMatrix(container: HTMLElement, state: AppState, instanceId: string): void {
  const inst = state.equipment.find((e) => e.instanceId === instanceId);
  const product = inst ? catalog.get(inst.productId) : undefined;
  if (!inst || !isRoutableProduct(product)) return;
  const { inputs, outputs } = matrixPorts(inst.instanceId, inst.productId, catalog);
  if (!inputs.length || !outputs.length) return;

  const title = document.createElement('div');
  title.className = 'nav-section-title';
  title.textContent = 'VIDEO ROUTER';
  container.appendChild(title);
  const note = document.createElement('div');
  note.className = 'badge-note';
  note.textContent = `${inputs.length}×${outputs.length} from catalog ports. Empty cells mean no route.`;
  container.appendChild(note);

  const table = document.createElement('table');
  table.className = 'route-matrix';
  const head = document.createElement('tr');
  head.appendChild(document.createElement('th'));
  outputs.forEach((o) => {
    const th = document.createElement('th');
    th.textContent = o.label.replace('HDMI ', '');
    th.title = o.label;
    head.appendChild(th);
  });
  table.appendChild(head);
  inputs.forEach((inp) => {
    const tr = document.createElement('tr');
    const lab = document.createElement('th');
    lab.textContent = inp.label.replace('HDMI ', '');
    lab.title = inp.label;
    tr.appendChild(lab);
    outputs.forEach((out) => {
      const td = document.createElement('td');
      const on = routeForOutput(state.routes, inst.instanceId, out.id)?.inputPortId === inp.id;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'route-cell' + (on ? ' on' : '');
      b.textContent = on ? '●' : '○';
      b.title = `${inp.label} → ${out.label}`;
      b.onclick = () => {
        if (on) state.clearRoute(inst.instanceId, out.id);
        else state.setRoute(inst.instanceId, inp.id, out.id);
      };
      td.appendChild(b);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  container.appendChild(table);
}
