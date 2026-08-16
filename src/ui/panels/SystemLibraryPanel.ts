/**
 * SystemLibraryPanel.ts
 * Add catalog system-role devices into the same equipment list used by 3D/Plan.
 */

import type { AppState } from '../../app/AppState';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';
import type { EquipmentCategory } from '../../catalog/EquipmentCatalog';
import { SYSTEM_ROLE_CATEGORIES } from '../../system/SystemTypes';

const catalog = loadDefaultCatalog();

const GROUPS: Array<{ id: string; label: string; categories: EquipmentCategory[] }> = [
  { id: 'sources', label: 'Sources', categories: ['source'] },
  { id: 'video', label: 'Video', categories: ['switcher', 'extender', 'display'] },
  { id: 'audio', label: 'Audio', categories: ['dsp', 'amplifier', 'microphone', 'speaker'] },
  { id: 'cameras', label: 'Cameras', categories: ['camera'] },
  { id: 'network', label: 'Network', categories: ['network'] },
  { id: 'control', label: 'Control', categories: ['control'] }
];

export function renderSystemLibraryPanel(container: HTMLElement, state: AppState): void {
  container.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'nav-section-title';
  title.textContent = 'SYSTEM LIBRARY';
  container.appendChild(title);

  const note = document.createElement('div');
  note.className = 'badge-note';
  note.textContent =
    'Devices are catalog instances shared with Design. Compatibility comes from ports, not room size.';
  container.appendChild(note);

  GROUPS.forEach((g) => {
    const h = document.createElement('div');
    h.className = 'nav-section-title';
    h.textContent = g.label;
    container.appendChild(h);
    const products = catalog.all().filter((p) => g.categories.includes(p.category));
    if (!products.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'No catalog data';
      container.appendChild(empty);
      return;
    }
    products.forEach((p) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'tree-item';
      row.style.width = '100%';
      row.textContent = `${p.manufacturer} ${p.model}`;
      row.title = p.source ?? p.category;
      row.onclick = () => {
        const id = `eq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        state.addEquipment({
          instanceId: id,
          productId: p.id,
          name: `${p.manufacturer} ${p.model}`,
          position: { x: 0, y: 1, z: 0 },
          rotationY: 0,
          placementMode: 'manual'
        });
        state.select('equipment', id);
        if (!state.systemLayout[id]) {
          const n = Object.keys(state.systemLayout).length;
          state.setSystemNodePos(id, 40 + (n % 4) * 240, 40 + Math.floor(n / 4) * 140);
        }
      };
      container.appendChild(row);
    });
  });

  const ids = state.selectedEquipmentIds();
  if (ids.length === 2) {
    const btn = document.createElement('button');
    btn.className = 'btn primary';
    btn.textContent = 'Connect video/audio (compatible ports)';
    btn.onclick = () => state.connectCompatiblePair(ids[0], ids[1]);
    container.appendChild(btn);
  }

  void SYSTEM_ROLE_CATEGORIES;
}
