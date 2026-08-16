/**
 * First-run / New Project overlay. Writes DesignRequirements only.
 */

import type { AppState } from '../../app/AppState';
import type { DesignUseCase } from '../../autodesign/DesignRequirements';
import { CAPACITY_PRESETS, PROJECT_TYPES } from '../workspace/projectSetup';

export function renderProjectSetupOverlay(host: HTMLElement, state: AppState): void {
  let el = host.querySelector('.setup-overlay') as HTMLElement | null;
  if (!state.setupOpen) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.className = 'setup-overlay';
    host.appendChild(el);
  }
  el.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'setup-card';
  el.appendChild(card);

  const h = document.createElement('h2');
  h.textContent = 'New project';
  const sub = document.createElement('p');
  sub.className = 'sub';
  sub.textContent = 'Define the room first. Auto Design uses these requirements with catalog data — specifications are never invented.';
  card.append(h, sub);

  const d = state.setupDraft;

  const typeGrid = document.createElement('div');
  typeGrid.className = 'setup-grid';
  PROJECT_TYPES.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'setup-choice' + (d.projectType === t.id ? ' active' : '');
    b.textContent = t.label;
    b.onclick = () => state.patchSetupDraft({ projectType: t.id });
    typeGrid.appendChild(b);
  });
  label(card, 'Project type');
  card.appendChild(typeGrid);

  const capRow = document.createElement('div');
  capRow.className = 'setup-chips';
  CAPACITY_PRESETS.forEach((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'setup-choice' + (d.capacity === n ? ' active' : '');
    b.textContent = String(n);
    b.onclick = () => state.patchSetupDraft({ capacity: n, customCapacity: false });
    capRow.appendChild(b);
  });
  const custom = document.createElement('button');
  custom.type = 'button';
  custom.className = 'setup-choice' + (d.customCapacity ? ' active' : '');
  custom.textContent = 'Custom';
  custom.onclick = () => state.patchSetupDraft({ customCapacity: true });
  capRow.appendChild(custom);
  label(card, 'Capacity');
  card.appendChild(capRow);
  if (d.customCapacity) {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '1';
    inp.value = String(d.capacity);
    inp.oninput = () => state.patchSetupDraft({ capacity: Math.max(1, Number(inp.value) || 1) });
    card.appendChild(inp);
  }

  const dims = document.createElement('div');
  dims.className = 'setup-dims';
  dims.append(
    dimField('Width (m)', d.widthM, (v) => state.patchSetupDraft({ widthM: v })),
    dimField('Length (m)', d.lengthM, (v) => state.patchSetupDraft({ lengthM: v })),
    dimField('Height (m)', d.heightM, (v) => state.patchSetupDraft({ heightM: v }))
  );
  label(card, 'Room');
  card.appendChild(dims);

  const useRow = document.createElement('div');
  useRow.className = 'setup-chips';
  (['meeting', 'presentation', 'video_conference', 'hybrid', 'training'] as DesignUseCase[]).forEach((u) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'setup-choice' + (d.useCase === u ? ' active' : '');
    b.textContent = u.replace('_', ' ');
    b.onclick = () => state.patchSetupDraft({ useCase: u });
    useRow.appendChild(b);
  });
  label(card, 'Use case');
  card.appendChild(useRow);

  const acc = document.createElement('div');
  acc.className = 'setup-chips';
  ;(['standard', 'enhanced'] as const).forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'setup-choice' + (d.accessibility === a ? ' active' : '');
    b.textContent = a === 'standard' ? 'Standard' : 'Enhanced';
    b.title = 'Stored with the project. Accessibility simulation is not implemented.';
    b.onclick = () => state.patchSetupDraft({ accessibility: a });
    acc.appendChild(b);
  });
  label(card, 'Accessibility');
  card.appendChild(acc);
  const accNote = document.createElement('div');
  accNote.className = 'muted';
  accNote.textContent = 'Enhanced is a project preference only — no accessibility engine is claimed.';
  card.appendChild(accNote);

  const actions = document.createElement('div');
  actions.className = 'setup-actions';
  const auto = document.createElement('button');
  auto.className = 'btn primary';
  auto.textContent = 'Auto Design';
  auto.onclick = () => state.beginFromSetup('auto');
  const manual = document.createElement('button');
  manual.className = 'btn';
  manual.textContent = 'Start manually';
  manual.onclick = () => state.beginFromSetup('manual');
  actions.append(auto, manual);
  card.appendChild(actions);
}

function label(parent: HTMLElement, text: string): void {
  const el = document.createElement('div');
  el.className = 'setup-label';
  el.textContent = text;
  parent.appendChild(el);
}

function dimField(labelText: string, value: number, onChange: (v: number) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const l = document.createElement('label');
  l.textContent = labelText;
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.step = '0.1';
  inp.value = String(value);
  inp.onchange = () => onChange(Number(inp.value));
  wrap.append(l, inp);
  return wrap;
}
