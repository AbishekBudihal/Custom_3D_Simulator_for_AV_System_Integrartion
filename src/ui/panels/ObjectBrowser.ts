/**
 * ObjectBrowser.ts
 * Project tree. Selection syncs with viewport. Hide/isolate are view state.
 */

import type { AppState } from '../../app/AppState';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';

const catalog = loadDefaultCatalog();

export function renderObjectBrowser(container: HTMLElement, state: AppState): void {
  container.innerHTML = '';

  if (!state.room) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<div class="empty-title">No room yet</div><div class="empty-body">Use New Project, or Auto Design, to define the room first.</div>`;
    container.appendChild(empty);
    return;
  }

  const doors = state.room.openings.filter((o) => o.kind === 'door').length;
  const windows = state.room.openings.filter((o) => o.kind === 'window').length;
  group(container, state, 'ROOM', [
    { id: 'walls', label: `Walls · ${state.room.width}×${state.room.depth} m`, kind: 'none', selectId: null },
    { id: 'doors', label: `Doors (${doors})`, kind: 'none', selectId: null },
    { id: 'windows', label: `Windows (${windows})`, kind: 'none', selectId: null },
    { id: 'columns', label: `Columns (${state.room.columns.length})`, kind: 'none', selectId: null }
  ]);

  const furniture = [
    ...state.tables.map((t) => ({
      id: t.id,
      label: t.id.replace(/-/g, ' '),
      kind: 'table' as const,
      selectId: t.id
    })),
    {
      id: 'chairs',
      label: `Chairs (${state.seats.length})`,
      kind: 'none' as const,
      selectId: null
    }
  ];
  group(container, state, 'FURNITURE', furniture);

  const byCat = new Map<string, typeof state.equipment>();
  state.equipment.forEach((inst) => {
    const cat = catalog.get(inst.productId)?.category ?? 'other';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(inst);
  });
  const av: Array<{ id: string; label: string; kind: 'equipment' | 'none'; selectId: string | null }> = [];
  (['display', 'microphone', 'speaker', 'camera', 'source', 'switcher', 'extender', 'dsp', 'amplifier', 'network', 'control'] as const).forEach((cat) => {
    const list = byCat.get(cat) ?? [];
    if (list.length) {
      av.push({
        id: `hdr-${cat}`,
        label: `${cat[0].toUpperCase()}${cat.slice(1)}s (${list.length})`,
        kind: 'none',
        selectId: null
      });
      list.forEach((inst) => {
        const hidden = state.hiddenEquipmentIds.includes(inst.instanceId) ? ' (hidden)' : '';
        av.push({
          id: inst.instanceId,
          label: `  ${inst.name}${hidden}`,
          kind: 'equipment',
          selectId: inst.instanceId
        });
      });
    }
  });
  if (!av.length) {
    group(container, state, 'AV EQUIPMENT', [
      { id: 'av-empty', label: 'None placed — open Catalog', kind: 'none', selectId: null }
    ]);
  } else {
    group(container, state, 'AV EQUIPMENT', av);
  }

  const signalBuckets: Array<[string, string[]]> = [
    ['Sources', ['source']],
    ['Video', ['display', 'switcher', 'extender', 'camera']],
    ['Audio', ['microphone', 'speaker', 'dsp', 'amplifier']],
    ['USB', ['source']],
    ['Network', ['network']],
    ['Control', ['control']]
  ];
  const sysItems: Array<{ id: string; label: string; kind: 'equipment' | 'none'; selectId: string | null }> = [
    { id: 'sys-conn', label: `Connections (${state.connections.length})`, kind: 'none', selectId: null }
  ];
  signalBuckets.forEach(([label, cats]) => {
    const n = state.equipment.filter((e) => cats.includes(catalog.get(e.productId)?.category ?? '')).length;
    sysItems.push({ id: `sys-${label}`, label: `${label} (${n})`, kind: 'none', selectId: null });
  });
  group(container, state, 'SYSTEM', sysItems);
}

function group(
  container: HTMLElement,
  state: AppState,
  groupTitle: string,
  items: Array<{ id: string; label: string; kind: 'seat' | 'equipment' | 'table' | 'none'; selectId: string | null }>
): void {
  const collapsed = !!state.collapsedTreeGroups[groupTitle];
  const wrap = document.createElement('div');
  wrap.className = 'tree-group';
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'tree-group-header';
  header.textContent = `${collapsed ? '▸' : '▾'} ${groupTitle}`;
  header.onclick = () => state.setTreeGroupCollapsed(groupTitle, !collapsed);
  wrap.appendChild(header);
  if (!collapsed) {
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'tree-item';
      const isActive =
        item.selectId != null &&
        ((state.selection.kind === item.kind && state.selection.id === item.selectId) ||
          (item.kind === 'equipment' && state.additionalSelectedIds.includes(item.selectId)));
      if (isActive) row.classList.add('active');
      const lab = document.createElement('span');
      lab.textContent = item.label;
      row.appendChild(lab);
      if (item.selectId && item.kind !== 'none' && !item.id.startsWith('hdr-')) {
        row.style.cursor = 'pointer';
        row.onclick = () => {
          state.select(item.kind, item.selectId);
          if (item.kind === 'equipment' || item.kind === 'seat') state.requestFocus();
        };
        if (item.kind === 'equipment') {
          const hide = document.createElement('button');
          hide.type = 'button';
          hide.className = 'tree-view-btn';
          hide.textContent = state.hiddenEquipmentIds.includes(item.selectId) ? 'Show' : 'Hide';
          hide.onclick = (e) => {
            e.stopPropagation();
            state.toggleEquipmentHidden(item.selectId!);
          };
          const iso = document.createElement('button');
          iso.type = 'button';
          iso.className = 'tree-view-btn';
          iso.textContent = 'Isolate';
          iso.onclick = (e) => {
            e.stopPropagation();
            state.isolateEquipment(item.selectId!);
          };
          row.append(hide, iso);
        }
      } else if (item.kind === 'none') {
        row.classList.add('tree-item-muted');
      }
      wrap.appendChild(row);
    });
  }
  if (groupTitle === 'AV EQUIPMENT' && state.hiddenEquipmentIds.length) {
    const show = document.createElement('button');
    show.className = 'btn';
    show.textContent = 'Show all equipment';
    show.onclick = () => state.showAllEquipment();
    wrap.appendChild(show);
  }
  container.appendChild(wrap);
}
