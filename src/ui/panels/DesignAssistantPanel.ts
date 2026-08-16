import type { AppState } from '../../app/AppState';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';
import { inventory } from '../../autodesign/DesignPipeline';
import { recommendationsAfterManual } from '../../autodesign/Recommendations';
import { selectedOption } from '../../autodesign/DesignPipeline';

const catalog = loadDefaultCatalog();

export function renderDesignAssistant(host: HTMLElement, state: AppState): void {
  let el = host.querySelector('.ad-assistant') as HTMLElement | null;
  if (state.workspaceMode !== 'design' || state.autoDesignOpen) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.className = 'ad-assistant';
    host.appendChild(el);
  }
  el.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'ad-assistant-title';
  title.textContent = 'DESIGN ASSISTANT';
  title.onclick = () => state.toggleAssistantCollapsed();
  el.appendChild(title);
  if (state.assistantCollapsed) {
    title.textContent = 'DESIGN ASSISTANT ▸';
    return;
  }

  const inv = inventory(
    {
      room: state.room,
      seats: state.seats,
      tables: state.tables,
      equipment: state.equipment,
      connections: state.connections,
      routes: state.routes
    },
    catalog
  );
  const lines: Array<[boolean | 'warn', string]> = [
    [inv.room, 'Room defined'],
    [inv.seating, 'Seating generated'],
    [inv.display, 'Display selected'],
    [inv.audio, 'Audio coverage calculated'],
    [inv.microphones, 'Microphones placed'],
    [inv.camera ? true : 'warn', inv.camera ? 'Camera placed' : 'Camera data / placement incomplete']
  ];
  lines.forEach(([ok, text]) => {
    const row = document.createElement('div');
    row.className = 'ad-asst-row';
    row.textContent = `${ok === true ? '✓' : ok === 'warn' && inv.camera ? '✓' : '⚠'} ${text}`;
    el!.appendChild(row);
  });

  const recs = recommendationsAfterManual(
    {
      room: state.room,
      seats: state.seats,
      tables: state.tables,
      equipment: state.equipment,
      connections: state.connections,
      routes: state.routes
    },
    catalog
  );
  recs
    .filter((r) => !state.dismissedRecommendationIds.includes(r.id))
    .forEach((r) => {
      const box = document.createElement('div');
      box.className = 'ad-rec';
      const t = document.createElement('strong');
      t.textContent = r.title;
      const m = document.createElement('div');
      m.textContent = r.message;
      box.append(t, m);
      (r.actions ?? []).forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn';
        b.textContent = a.label;
        b.onclick = () => {
          if (a.id === 'keep') state.dismissRecommendation(r.id);
          else state.requestAutoDesign();
        };
        box.appendChild(b);
      });
      el!.appendChild(box);
    });

  const next = document.createElement('div');
  next.className = 'muted';
  if (!inv.room) next.textContent = 'NEXT — Define the room or run Auto Design';
  else if (!inv.seating) next.textContent = 'NEXT — Generate seating';
  else if (!inv.display) next.textContent = 'NEXT — Add a display or run Auto Design';
  else next.textContent = 'NEXT — Review validation / System topology';
  el.appendChild(next);

  const opt = state.autoDesignProposal ? selectedOption(state.autoDesignProposal) : null;
  if (opt?.picks.camera?.completeness === 'partial') {
    const n = document.createElement('div');
    n.className = 'badge-note';
    n.textContent = '⚠ Camera: ' + opt.picks.camera.completenessReason;
    el.appendChild(n);
  }

  const review = document.createElement('button');
  review.className = 'btn primary';
  review.textContent = 'REVIEW / AUTO DESIGN';
  review.onclick = () => state.requestAutoDesign();
  el.appendChild(review);
}
