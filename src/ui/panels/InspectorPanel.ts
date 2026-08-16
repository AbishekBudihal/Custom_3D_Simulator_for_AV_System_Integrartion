import type { AppState } from '../../app/AppState';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';
import { snapEquipment } from '../../interaction/SnapEngine';
import { renderDisplayAnalysisControls } from './DisplayAnalysisPanel';
import { renderMicAnalysisControls } from './MicAnalysisPanel';
import { renderAudioAnalysisControls } from './AudioAnalysisPanel';
import { renderCameraAnalysisControls } from './CameraAnalysisPanel';
import { resolveInstancePorts } from '../../system/PortResolver';
import { renderRoutingMatrix } from './RoutingMatrix';
import { describePath, enumerateSignalPaths } from '../../system/SignalPathEngine';
import { conferenceClearanceM } from '../../room/FurnitureRelayout';
import { furnitureTemplate } from '../../room/FurnitureCatalog';
import { getPresentationWall } from '../../room/RoomGeometry';
import { validationReportFor } from '../../av/validation/validationCache';
import { usedRackUnits } from '../../av/AVRack';
import { inspectSeat } from '../../av/SeatInspection';
import { compatibleDestinations, compatibleSources } from '../../system/PortCompatibility';
import { cachedCableRoute } from '../../system/CableRouter';
import { cableRouteContext } from '../../system/cableContext';
import { cableTypeOf } from '../../system/CableBoq';
import {
  catalogCardLine,
  deg,
  inputSummary,
  kg,
  mm,
  mountSummary,
  NOT_SPECIFIED,
  typeLabel
} from '../../catalog/CatalogPresentation';
import { evaluatePlacement } from '../../av/PlacementFeedback';

const catalog = loadDefaultCatalog();

function metricRow(container: HTMLElement, label: string, value: string, statusEl?: HTMLElement): void {
  const row = document.createElement('div');
  row.className = 'metric-row';
  const l = document.createElement('span'); l.className = 'label'; l.textContent = label;
  const v = document.createElement('span'); v.className = 'value'; v.textContent = value;
  row.append(l, v);
  if (statusEl) row.appendChild(statusEl);
  container.appendChild(row);
}

function statusPill(status: 'pass' | 'warning' | 'fail' | 'info'): HTMLElement {
  const el = document.createElement('span');
  el.className = `status-pill ${status === 'info' ? 'info' : status}`;
  el.textContent =
    status === 'pass' ? '✓ PASS' : status === 'warning' ? '⚠ WARNING' : status === 'fail' ? '✕ ERROR' : 'ⓘ INFO';
  return el;
}

function why(container: HTMLElement, label: string, text: string): void {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'why-link';
  btn.textContent = label;
  const body = document.createElement('div');
  body.className = 'why-body';
  body.hidden = true;
  body.textContent = text;
  btn.onclick = () => {
    body.hidden = !body.hidden;
  };
  container.append(btn, body);
}

function section(container: HTMLElement, title: string, open = true): HTMLElement {
  const d = document.createElement('details');
  d.className = 'insp-section';
  d.open = open;
  const s = document.createElement('summary');
  s.textContent = title;
  const inner = document.createElement('div');
  d.append(s, inner);
  container.appendChild(d);
  return inner;
}

function numField(container: HTMLElement, label: string, value: number, step: number, onChange: (v: number) => void): void {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  input.value = String(value);
  input.onchange = () => onChange(Number(input.value));
  wrap.append(lbl, input);
  container.appendChild(wrap);
}

export function renderInspectorPanel(container: HTMLElement, state: AppState): void {
  container.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'nav-section-title';
  container.appendChild(title);
  const body = document.createElement('div');
  container.appendChild(body);

  if (state.selectedConnectionId) {
    title.textContent = 'CONNECTION';
    renderConnectionInspector(body, state, state.selectedConnectionId);
    return;
  }

  if (state.selection.kind === 'seat' && state.selection.id) {
    title.textContent = `SEAT ${state.selection.id}`;
    renderSeatInspector(body, state, state.selection.id);
    return;
  }

  if (state.selection.kind === 'table' && state.selection.id) {
    title.textContent = 'TABLE';
    renderTableInspector(body, state, state.selection.id);
    return;
  }

  if (state.selection.kind === 'rack' && state.selection.id) {
    title.textContent = 'AV RACK';
    renderRackInspector(body, state, state.selection.id);
    return;
  }

  if (state.selection.kind === 'equipment' && state.selection.id) {
    const inst = state.equipment.find((e) => e.instanceId === state.selection.id);
    const product = inst ? catalog.get(inst.productId) : null;
    title.textContent = (product?.category ?? 'EQUIPMENT').replace(/_/g, ' ').toUpperCase();
    renderEquipmentInspector(body, state, state.selection.id);
    return;
  }

  if (state.selection.kind === 'room') {
    title.textContent = 'ROOM';
    renderRoomInspector(body, state);
    return;
  }

  if (state.selection.kind === 'none' || !state.selection.id) {
    title.textContent = 'PROPERTIES';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    if (!state.equipment.length) {
      empty.innerHTML = `<div class="empty-title">No project objects selected</div>
        <div class="empty-body">Create a project or open an existing design, then add AV devices from the catalog.</div>`;
    } else {
      empty.innerHTML = `<div class="empty-title">No object selected</div>
        <div class="empty-body">Select an AV device, seat, table, or rack to view its properties.</div>`;
    }
    body.appendChild(empty);
    const catalogBtn = document.createElement('button');
    catalogBtn.className = 'btn primary';
    catalogBtn.textContent = 'Browse Catalog';
    catalogBtn.onclick = () => state.setDesignTool('catalog');
    const autoBtn = document.createElement('button');
    autoBtn.className = 'btn';
    autoBtn.textContent = 'Auto Design';
    autoBtn.onclick = () => state.requestAutoDesign();
    body.append(catalogBtn, autoBtn);
    return;
  }
}

function renderRoomInspector(body: HTMLElement, state: AppState): void {
  const room = state.room;
  if (!room) return;
  const geo = section(body, 'Geometry', true);
  numField(geo, 'Width (m)', room.width, 0.1, (v) => state.setRoom({ ...room, width: v }));
  numField(geo, 'Length (m)', room.depth, 0.1, (v) => state.setRoom({ ...room, depth: v }));
  numField(geo, 'Height (m)', room.height, 0.1, (v) => state.setRoom({ ...room, height: v }));
  why(
    geo,
    'Why these dimensions?',
    'Room size is architectural. Changing it recalculates validation. Seating is not regenerated until you choose Regenerating Seating.'
  );
  const regen = document.createElement('button');
  regen.className = 'btn';
  regen.textContent = 'Regenerate Seating';
  regen.onclick = () => state.regenerateSeating();
  body.appendChild(regen);
}

function renderTableInspector(body: HTMLElement, state: AppState, tableId: string): void {
  const table = state.tables.find((t) => t.id === tableId);
  if (!table) return;
  const tmpl = furnitureTemplate(table.furnitureId ?? 'generic-conference');
  const beginner = state.uiComplexity === 'beginner';

  metricRow(body, 'Type', 'Conference');
  metricRow(
    body,
    'Dimensions',
    `${table.sizeX.toFixed(2)} × ${table.sizeZ.toFixed(2)} × ${(table.height ?? 0.73).toFixed(2)} m`
  );
  metricRow(body, 'Seats', String(state.seats.length));
  if (state.room) {
    const clear = conferenceClearanceM(state.room, table);
    metricRow(body, 'Clearance', `${clear.toFixed(2)} m`, statusPill(clear >= 0.7 ? 'pass' : 'warning'));
  }

  why(
    body,
    'Why is this table this size?',
    'Length and width come from seating capacity, seat spacing, and circulation — not from the distance between walls.'
  );

  const geo = section(body, 'Geometry', true);
  numField(geo, 'Length (m)', table.sizeZ, 0.05, (v) => state.updateTable(tableId, { sizeZ: v }));
  numField(geo, 'Width (m)', table.sizeX, 0.05, (v) => state.updateTable(tableId, { sizeX: v }));
  numField(geo, 'Height (m)', table.height ?? 0.73, 0.01, (v) => state.updateTable(tableId, { height: v }));

  const place = section(body, 'Placement', !beginner);
  numField(place, 'Position X (m)', table.centerX, 0.05, (v) => state.updateTable(tableId, { centerX: v }));
  numField(place, 'Position Z (m)', table.centerZ, 0.05, (v) => state.updateTable(tableId, { centerZ: v }));
  metricRow(place, 'Rotation', '0° (90° steps)');

  const seating = section(body, 'Seating', true);
  metricRow(seating, 'Capacity', String(state.seats.length));
  metricRow(seating, 'Seats per long side', String(Math.max(1, Math.ceil((state.seats.length - 1) / 2))));
  metricRow(seating, 'End seats', state.seats.length > 6 ? '1' : '0');
  metricRow(seating, 'Orientation', table.sizeZ >= table.sizeX ? 'Long axis along room length' : 'Rotated 90°');

  if (!beginner) {
    const eng = section(body, 'Engineering', true);
    metricRow(eng, 'Template', table.furnitureId ?? 'generic-conference');
    metricRow(eng, 'Chair from edge', `${tmpl.chairFromEdge} m`);
    metricRow(eng, 'Cable well', table.hasCableWell ? 'Yes' : 'No');
  }

  const val = section(body, 'Validation', true);
  const findings = validationReportFor(state).findings.filter(
    (f) => f.affectedObjects.some((o) => o.id === tableId) || f.code.startsWith('FURN')
  );
  if (!findings.length) {
    metricRow(val, 'Furniture', '✓ PASS', statusPill('pass'));
  } else {
    findings.slice(0, 6).forEach((f) => {
      const sev = f.severity === 'error' ? 'fail' : f.severity === 'warning' ? 'warning' : f.severity === 'info' ? 'info' : 'pass';
      metricRow(val, f.code, f.title, statusPill(sev));
    });
  }

  const actions = document.createElement('div');
  const edit = document.createElement('button');
  edit.className = 'btn primary';
  edit.textContent = 'Edit';
  edit.onclick = () => state.setDesignTool('seating');
  const dup = document.createElement('button');
  dup.className = 'btn';
  dup.textContent = 'Duplicate';
  dup.onclick = () => state.duplicateSelectedTable();
  const align = document.createElement('button');
  align.className = 'btn';
  align.textContent = 'Align';
  align.onclick = () => state.alignSelectedTableCenter();
  const del = document.createElement('button');
  del.className = 'btn';
  del.textContent = 'Delete';
  del.onclick = () => state.deleteSelected();
  const issue = document.createElement('button');
  issue.className = 'btn';
  issue.textContent = 'View Issue';
  issue.onclick = () => state.setShellNav('validate');
  actions.append(edit, dup, align, del, issue);
  body.appendChild(actions);
}

function renderRackInspector(body: HTMLElement, state: AppState, rackId: string): void {
  const rack = state.racks.find((r) => r.id === rackId);
  if (!rack) return;
  const assigned = state.equipment
    .filter((e) => e.rackId === rack.id)
    .sort((a, b) => (a.rackPositionRU ?? 0) - (b.rackPositionRU ?? 0));
  const used = usedRackUnits(assigned);
  metricRow(body, 'Rack type', rack.kind === 'wall' ? 'Wall-mounted' : 'Floor-standing');
  metricRow(body, 'Height / RU', `${rack.ruTotal} RU · ${rack.height.toFixed(2)} m`);
  metricRow(body, 'Width × depth', `${rack.width.toFixed(2)} × ${rack.depth.toFixed(2)} m`);
  metricRow(body, 'Used RU', String(used));
  metricRow(body, 'Available RU', String(rack.ruTotal - used));
  metricRow(body, 'Front clearance', `${rack.frontClearance.toFixed(2)} m`);
  metricRow(body, 'Rear clearance', `${rack.rearClearance.toFixed(2)} m`);
  numField(body, 'Position X (m)', rack.x, 0.05, (v) => state.updateRack(rackId, { x: v }));
  numField(body, 'Position Z (m)', rack.z, 0.05, (v) => state.updateRack(rackId, { z: v }));
  numField(body, 'Rotation Y (°)', (rack.rotationY * 180) / Math.PI, 5, (v) =>
    state.updateRack(rackId, { rotationY: (v * Math.PI) / 180 })
  );

  const elevTitle = document.createElement('div');
  elevTitle.className = 'nav-section-title';
  elevTitle.textContent = 'RACK ELEVATION';
  body.appendChild(elevTitle);
  const note = document.createElement('div');
  note.className = 'badge-note';
  note.textContent =
    'Generated from equipment assigned to this rack. RU is never invented from category. Switch to Elevation for the diagram.';
  body.appendChild(note);
  assigned.forEach((e) => {
    const ru = e.rackUnits;
    metricRow(
      body,
      `${e.name}`,
      ru && ru > 0 ? `U${e.rackPositionRU ?? '—'} · ${ru} RU` : 'DATA INCOMPLETE — no RU'
    );
  });
  if (!assigned.length) {
    const empty = document.createElement('div');
    empty.className = 'badge-note';
    empty.textContent = `AVAILABLE ${rack.ruTotal} RU`;
    body.appendChild(empty);
  } else {
    const spare = document.createElement('div');
    spare.className = 'badge-note';
    spare.textContent = `AVAILABLE ${rack.ruTotal - used} RU`;
    body.appendChild(spare);
  }

  const del = document.createElement('button');
  del.className = 'btn';
  del.textContent = 'Remove rack';
  del.onclick = () => state.deleteSelected();
  body.appendChild(del);
}

function renderSeatInspector(body: HTMLElement, state: AppState, seatId: string): void {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat) return;

  numField(body, 'Position X (m)', seat.x, 0.05, (v) => state.updateSeat(seatId, { x: v }));
  numField(body, 'Position Z (m)', seat.z, 0.05, (v) => state.updateSeat(seatId, { z: v }));
  numField(body, 'Rotation (°)', (seat.facing * 180) / Math.PI, 5, (v) =>
    state.updateSeat(seatId, { facing: (v * Math.PI) / 180 })
  );

  const insp = inspectSeat(seat, state.equipment, catalog, state.room, state.tables);
  metricRow(body, 'Occupant eye height', `${insp.occupant.eyeHeightM.toFixed(2)} m`);

  if (!insp.display) {
    const note = document.createElement('div');
    note.className = 'inspector-empty';
    note.textContent = 'No display placed yet — add one in the Equipment step to see viewing analysis for this seat.';
    body.appendChild(note);
  } else {
    const analysis = insp.display;
    const dt = section(body, 'DISPLAY', true);
    metricRow(dt, 'Distance', `${analysis.distance.value} m`);
    metricRow(dt, 'Horizontal angle', `${analysis.horizontalAngle.value}°`, statusPill(analysis.horizontalAngle.status));
    metricRow(dt, 'Vertical angle', `${analysis.verticalAngle.value}°`, statusPill(analysis.verticalAngle.status));
    metricRow(dt, 'Viewing distance', `${analysis.viewingDistance.value} m`, statusPill(analysis.viewingDistance.status));
    metricRow(dt, 'Visibility', analysis.visibility.value.replace('_', ' '), statusPill(analysis.visibility.status));
    metricRow(dt, 'Sightline', analysis.sightline.value, statusPill(analysis.sightline.status));
    metricRow(dt, 'Status', analysis.overall.toUpperCase(), statusPill(analysis.overall));
    const overall = document.createElement('div');
    overall.className = 'badge-note';
    overall.innerHTML = `Overall: ${statusPill(analysis.overall).outerHTML}<br><br><b>Methodology:</b> ${analysis.viewingDistance.method}`;
    dt.appendChild(overall);
    if (analysis.overall !== 'pass') {
      const go = document.createElement('button');
      go.className = 'btn';
      go.textContent = 'Analyze Display';
      go.onclick = () => {
        const d = state.equipment.find((e) => catalog.get(e.productId)?.category === 'display');
        if (d) state.analyzeEquipment(d.instanceId);
      };
      dt.appendChild(go);
    }
    if (analysis.sightline.status === 'fail') {
      const blocked = document.createElement('div');
      blocked.className = 'badge-note';
      blocked.style.color = 'var(--danger)';
      blocked.textContent = analysis.sightline.method;
      dt.appendChild(blocked);
    }
  }

  const viewerBtn = document.createElement('button');
  viewerBtn.className = 'btn primary';
  viewerBtn.textContent = 'View from this seat';
  viewerBtn.onclick = () => state.enterViewerMode(seat.id);
  body.appendChild(viewerBtn);

  if (insp.mic) {
    const micR = insp.mic;
    const micSec = section(body, 'MICROPHONE', true);
    metricRow(
      micSec,
      'Pickup (geometric)',
      micR.covered
        ? `inside · ${micR.nearestDistanceM ?? '—'} m${micR.angularDeltaDeg != null ? ` · ${micR.angularDeltaDeg}°` : ''}`
        : `outside · ${micR.nearestDistanceM ?? '—'} m`,
      statusPill(micR.status)
    );
    const micNote = document.createElement('div');
    micNote.className = 'badge-note';
    micNote.textContent = micR.criterion;
    micSec.appendChild(micNote);
    if (micR.status !== 'pass') {
      const go = document.createElement('button');
      go.className = 'btn';
      go.textContent = 'Analyze Pickup';
      go.onclick = () => {
        const m = state.equipment.find((e) => catalog.get(e.productId)?.category === 'microphone');
        if (m) state.analyzeEquipment(m.instanceId);
      };
      micSec.appendChild(go);
    }
  }

  if (insp.speaker) {
    const audio = insp.speaker;
    const spk = section(body, 'SPEAKER', true);
    metricRow(
      spk,
      'Coverage (geometric)',
      audio.inDispersion ? 'inside dispersion' : 'outside dispersion',
      statusPill(audio.inDispersion ? (audio.status === 'fail' ? 'warning' : audio.status) : 'fail')
    );
    metricRow(
      spk,
      'Estimated SPL',
      audio.splAtSeat != null ? `${audio.splAtSeat} dB @ ${audio.distanceM ?? '—'} m` : 'outside dispersion / DATA INCOMPLETE',
      statusPill(audio.status)
    );
    const audioNote = document.createElement('div');
    audioNote.className = 'badge-note';
    audioNote.textContent = 'Method: geometric / free-field estimate — not room-acoustic simulation.';
    spk.appendChild(audioNote);
    if (!audio.inDispersion || audio.status === 'fail') {
      const go = document.createElement('button');
      go.className = 'btn';
      go.textContent = 'Analyze Coverage';
      go.onclick = () => {
        const s = state.equipment.find((e) => catalog.get(e.productId)?.category === 'speaker');
        if (s) state.analyzeEquipment(s.instanceId);
      };
      spk.appendChild(go);
    }
  }

  if (insp.camera) {
    const cam = insp.camera;
    const camIds = cam.visible ? cam.coveringCameraIds : cam.inFov ? cam.blockingCameraIds : [];
    const camSec = section(body, 'CAMERA', true);
    metricRow(camSec, 'FOV', cam.inFov ? 'Inside catalog HFOV (geometric)' : 'Outside catalog HFOV');
    metricRow(camSec, 'Sightline', cam.sightline.toUpperCase());
    metricRow(
      camSec,
      'Coverage',
      cam.visible ? `visible · ${camIds.join(', ') || '—'}` : cam.inFov ? `blocked · ${camIds.join(', ')}` : 'outside FOV',
      statusPill(cam.status)
    );
    const camNote = document.createElement('div');
    camNote.className = 'badge-note';
    camNote.textContent = 'Method: geometric frustum from catalog HFOV. Not image quality or NVR simulation.';
    camSec.appendChild(camNote);
    if (cam.status !== 'pass') {
      const go = document.createElement('button');
      go.className = 'btn';
      go.textContent = 'Analyze FOV';
      go.onclick = () => {
        const c = state.equipment.find((e) => catalog.get(e.productId)?.category === 'camera');
        if (c) state.analyzeEquipment(c.instanceId);
      };
      camSec.appendChild(go);
    }
  }
}

function renderEquipmentInspector(body: HTMLElement, state: AppState, instanceId: string): void {
  const inst = state.equipment.find((e) => e.instanceId === instanceId);
  if (!inst) return;
  const product = catalog.get(inst.productId);
  if (!product) return;

  const ident = document.createElement('div');
  ident.className = 'equip-identity';
  const mfr = document.createElement('div');
  mfr.className = 'manufacturer';
  mfr.textContent = product.manufacturer;
  const model = document.createElement('div');
  model.className = 'model';
  model.textContent = product.model;
  const cat = document.createElement('div');
  cat.className = 'muted';
  cat.textContent = `${typeLabel(product)}${product.display ? ` · ${product.display.diagonalInches}"` : ''}`;
  ident.append(mfr, model, cat);
  body.appendChild(ident);

  const prov = document.createElement('span');
  prov.className = `provenance ${product.provenance}`;
  prov.textContent = `${product.provenance.replace('_', ' ')} data`;
  body.appendChild(prov);

  metricRow(body, 'Manufacturer', product.manufacturer || NOT_SPECIFIED);
  metricRow(body, 'Model', product.model || NOT_SPECIFIED);
  metricRow(body, 'Category', product.category.replace(/_/g, ' '));
  const nameField = document.createElement('div');
  nameField.className = 'field';
  const nameLbl = document.createElement('label');
  nameLbl.textContent = 'Instance name';
  const nameIn = document.createElement('input');
  nameIn.value = inst.name;
  nameIn.onchange = () => state.updateEquipment(instanceId, { name: nameIn.value, placementMode: inst.placementMode });
  nameField.append(nameLbl, nameIn);
  body.appendChild(nameField);

  if (['display', 'camera', 'speaker', 'microphone'].includes(product.category)) {
    const analyze = document.createElement('button');
    analyze.className = 'btn primary';
    analyze.textContent =
      product.category === 'display'
        ? 'Analyze Display'
        : product.category === 'camera'
          ? 'Analyze FOV'
          : product.category === 'speaker'
            ? 'Analyze Coverage'
            : 'Analyze Pickup';
    analyze.onclick = () => state.analyzeEquipment(instanceId);
    body.appendChild(analyze);
  }

  const dataStatus = document.createElement('div');
  dataStatus.className = 'badge-note';
  let incomplete = false;
  if (
    product.category === 'speaker' &&
    (product.speaker?.maxSplAt1m == null ||
      (product.speaker?.dispersionDeg == null &&
        !(product.speaker?.horizontalDispersionDeg && product.speaker?.verticalDispersionDeg)))
  ) {
    incomplete = true;
    dataStatus.style.color = 'var(--warning)';
    dataStatus.textContent = 'DATA INCOMPLETE — speaker SPL or dispersion missing. Simulation will not invent values.';
  } else if (product.category === 'microphone' && !(product.microphone?.pickupRadiusM && product.microphone.pickupRadiusM > 0)) {
    incomplete = true;
    dataStatus.style.color = 'var(--warning)';
    dataStatus.textContent = 'DATA INCOMPLETE — pickupRadiusM missing.';
  } else if (product.category === 'camera' && !(product.camera?.horizontalFovDeg && product.camera.horizontalFovDeg > 0)) {
    incomplete = true;
    dataStatus.style.color = 'var(--warning)';
    dataStatus.textContent = 'DATA INCOMPLETE — horizontal FOV is required. Camera coverage unavailable.';
  } else if (product.category === 'display' && (!product.physical.width || !product.physical.height)) {
    incomplete = true;
    dataStatus.style.color = 'var(--warning)';
    dataStatus.textContent = 'DATA INCOMPLETE — display size missing.';
  } else {
    dataStatus.textContent = `DATA ${product.provenance.replace('_', ' ').toUpperCase()} — ${product.source ?? 'catalog record'}`;
  }
  body.appendChild(dataStatus);
  if (product.category === 'display' && state.room) {
    const wall = getPresentationWall(state.room);
    why(
      body,
      'Why is the display here?',
      `The ${wall} wall is the presentation span. Suggested placement stays off door and window exclusion zones.`
    );
  }
  if (incomplete) {
    why(body, 'Why is this warning shown?', dataStatus.textContent ?? 'Required catalog engineering data is missing.');
  }
  if (incomplete) appendCatalogLink(body, state);

  if (product.display) {
    metricRow(body, 'Display technology', typeLabel(product));
    metricRow(body, 'Screen size', `${product.display.diagonalInches}"`);
    metricRow(body, 'Resolution', product.display.resolution || NOT_SPECIFIED);
  }
  const dims = section(body, 'DIMENSIONS', true);
  metricRow(dims, 'Width', mm(product.physical.width));
  metricRow(dims, 'Height', mm(product.physical.height));
  metricRow(dims, 'Depth', mm(product.physical.depth));
  metricRow(dims, 'Weight', kg(product.physical.weightKg));
  metricRow(body, 'Mounting', mountSummary(product));
  metricRow(body, 'Inputs / ports', inputSummary(product));
  if (product.display) {
    metricRow(body, 'Catalog summary', catalogCardLine(product));
  }
  if (product.microphone) {
    metricRow(body, 'Microphone type', product.microphone.pattern || NOT_SPECIFIED);
    metricRow(body, 'Pickup pattern', product.microphone.pattern || NOT_SPECIFIED);
    metricRow(
      body,
      'Pickup radius',
      product.microphone.pickupRadiusM != null ? `${product.microphone.pickupRadiusM} m` : NOT_SPECIFIED
    );
    metricRow(
      body,
      'Beam width',
      product.microphone.beamWidthDeg != null ? `${product.microphone.beamWidthDeg}°` : NOT_SPECIFIED
    );
    metricRow(body, 'Coverage model', product.microphone.coverageModel ?? 'omni (disc if radius present)');
    metricRow(body, 'Mount', product.microphone.mount || NOT_SPECIFIED);
    metricRow(body, 'Network / interface', product.microphone.connection || NOT_SPECIFIED);
  }
  if (product.speaker) {
    metricRow(body, 'Speaker type', typeLabel(product));
    metricRow(
      body,
      'Max SPL @ 1 m',
      product.speaker.maxSplAt1m != null ? `${product.speaker.maxSplAt1m} dB` : 'DATA INCOMPLETE'
    );
    metricRow(
      body,
      'Coverage angle',
      product.speaker.dispersionDeg != null
        ? `${product.speaker.dispersionDeg}°`
        : product.speaker.horizontalDispersionDeg != null && product.speaker.verticalDispersionDeg != null
          ? `${product.speaker.horizontalDispersionDeg}° H / ${product.speaker.verticalDispersionDeg}° V`
          : 'DATA INCOMPLETE'
    );
    metricRow(body, 'Horizontal dispersion', deg(product.speaker.horizontalDispersionDeg));
    metricRow(body, 'Vertical dispersion', deg(product.speaker.verticalDispersionDeg));
    metricRow(body, 'Mount', product.speaker.mount || NOT_SPECIFIED);
  }
  if (product.camera) {
    metricRow(body, 'Horizontal FOV', product.camera.horizontalFovDeg != null ? deg(product.camera.horizontalFovDeg) : 'DATA INCOMPLETE');
    metricRow(body, 'Vertical FOV', deg(product.camera.verticalFovDeg));
    metricRow(body, 'Mount', product.camera.mount || NOT_SPECIFIED);
    metricRow(body, 'Network / video', inputSummary(product));
  }
  if (product.category === 'rack' || product.rackUnits != null) {
    metricRow(body, 'Rack units', product.rackUnits != null ? `${product.rackUnits} RU` : NOT_SPECIFIED);
  }

  const placeNote = evaluatePlacement(state.room, state.tables, product, inst.position);
  const placeEl = document.createElement('div');
  placeEl.className = 'badge-note';
  placeEl.style.color = placeNote.status === 'valid' ? 'var(--success)' : 'var(--warning)';
  placeEl.textContent = placeNote.note;
  body.appendChild(placeEl);

  const pose = section(body, 'POSITION', true);
  numField(pose, 'X (m)', inst.position.x, 0.01, (v) =>
    state.updateEquipment(instanceId, { position: { ...inst.position, x: v } })
  );
  numField(pose, 'Y / mounting height (m)', inst.position.y, 0.01, (v) =>
    state.updateEquipment(instanceId, { position: { ...inst.position, y: v } })
  );
  numField(pose, 'Z (m)', inst.position.z, 0.01, (v) =>
    state.updateEquipment(instanceId, { position: { ...inst.position, z: v } })
  );
  numField(pose, 'Yaw (°)', (inst.rotationY * 180) / Math.PI, 5, (v) =>
    state.updateEquipment(instanceId, { rotationY: (v * Math.PI) / 180 })
  );
  metricRow(pose, 'Pitch', NOT_SPECIFIED);
  metricRow(pose, 'Roll', NOT_SPECIFIED);

  if (state.racks.length) {
    const rackSel = document.createElement('select');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Not in rack';
    rackSel.appendChild(none);
    state.racks.forEach((r) => {
      const o = document.createElement('option');
      o.value = r.id;
      o.textContent = `${r.id} (${r.ruTotal} RU)`;
      if (inst.rackId === r.id) o.selected = true;
      rackSel.appendChild(o);
    });
    rackSel.onchange = () => state.assignEquipmentToRack(instanceId, rackSel.value || null);
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = document.createElement('label');
    lab.textContent = 'Assign to AV rack';
    wrap.append(lab, rackSel);
    body.appendChild(wrap);
    if (inst.rackId) {
      metricRow(body, 'Rack position', inst.rackPositionRU != null ? `U${inst.rackPositionRU}` : '—');
      metricRow(body, 'Rack units', inst.rackUnits != null ? `${inst.rackUnits} RU` : product.rackUnits != null ? `${product.rackUnits} RU (catalog)` : 'DATA INCOMPLETE');
    }
  }

  const origin = inst.origin === 'auto' && inst.placementMode !== 'manual' ? 'AUTO' : inst.placementMode === 'manual' || inst.origin === 'manual' ? 'MANUAL OVERRIDE' : inst.placementMode === 'smart' ? 'SMART' : '';
  if (origin) {
    const originNote = document.createElement('div');
    originNote.className = 'badge-note';
    originNote.style.color = origin === 'MANUAL OVERRIDE' ? 'var(--warning)' : 'var(--success)';
    originNote.textContent =
      origin === 'AUTO'
        ? 'Placement: AUTO — generated starting position. Analysis uses this geometry.'
        : origin === 'SMART'
          ? 'Placement: SMART — catalog suggestion engine. Analysis uses this geometry.'
          : 'Placement: MANUAL OVERRIDE — analysis uses this position. Auto Design will not move it silently.';
    body.appendChild(originNote);
  }

  if (inst.placementMode === 'manual' && origin !== 'MANUAL OVERRIDE') {
    const manualNote = document.createElement('div');
    manualNote.className = 'badge-note';
    manualNote.style.color = 'var(--warning)';
    manualNote.textContent = 'Placement: MANUAL — analysis uses this position. Invalid engineering states are not implied.';
    body.appendChild(manualNote);
  }

  const snapBtn = document.createElement('button');
  snapBtn.className = 'btn';
  snapBtn.textContent = 'Snap to valid surface';
  snapBtn.onclick = () => {
    if (!state.room) return;
    const snapped = snapEquipment(state.room, product, inst.position, inst.rotationY);
    state.updateEquipment(instanceId, {
      position: snapped.position,
      rotationY: snapped.rotationY,
      wall: snapped.wall,
      placementMode: 'manual'
    });
    state.setSnapNote(snapped.note);
  };
  body.appendChild(snapBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn';
  delBtn.textContent = 'Remove';
  delBtn.onclick = () => state.removeEquipment(inst.instanceId);
  body.appendChild(delBtn);

  const ports = resolveInstancePorts(inst.instanceId, inst.productId, catalog);
  const portTitle = document.createElement('div');
  portTitle.className = 'nav-section-title';
  portTitle.textContent = 'PORTS';
  body.appendChild(portTitle);
  if (!ports.length) {
    const miss = document.createElement('div');
    miss.className = 'badge-note';
    miss.style.color = 'var(--warning)';
    miss.textContent = 'DATA INCOMPLETE — no catalog ports. System connections cannot be drawn.';
    body.appendChild(miss);
  } else {
    ports.forEach((p) => {
      const used = state.connections.some(
        (c) =>
          (c.fromInstanceId === inst.instanceId && c.fromPortId === p.id) ||
          (c.toInstanceId === inst.instanceId && c.toPortId === p.id)
      );
      metricRow(
        body,
        p.label,
        state.systemDetailMode === 'pro'
          ? `${p.direction} · ${p.signalTypes.join('/')} · ${p.connector}${used ? ' · CONNECTED' : ' · FREE'}`
          : used
            ? '✓ Connected'
            : 'Available'
      );
      if (used) return;
      const others = state.equipment.flatMap((e) =>
        e.instanceId === inst.instanceId ? [] : resolveInstancePorts(e.instanceId, e.productId, catalog)
      );
      const partners =
        p.direction === 'input' ? compatibleSources(p, others, state.connections) : compatibleDestinations(p, others, state.connections);
      if (!partners.length) return;
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const sel = document.createElement('select');
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = p.direction === 'input' ? `Connect source to ${p.label}…` : `Connect ${p.label} to…`;
      sel.appendChild(ph);
      partners.forEach((d) => {
        const eq = state.equipment.find((e) => e.instanceId === d.instanceId);
        const o = document.createElement('option');
        o.value = `${d.instanceId}::${d.id}`;
        o.textContent = `${eq?.name ?? d.instanceId} · ${d.label}`;
        sel.appendChild(o);
      });
      sel.onchange = () => {
        const [otherId, otherPort] = sel.value.split('::');
        if (!otherId || !otherPort) return;
        if (p.direction === 'input') state.addConnection(otherId, otherPort, p.instanceId, p.id);
        else state.addConnection(p.instanceId, p.id, otherId, otherPort);
      };
      wrap.appendChild(sel);
      body.appendChild(wrap);
    });
  }
  const linked = state.connections.filter((c) => c.fromInstanceId === inst.instanceId || c.toInstanceId === inst.instanceId);
  if (linked.length) {
    const cxTitle = document.createElement('div');
    cxTitle.className = 'nav-section-title';
    cxTitle.textContent = 'CONNECTIONS';
    body.appendChild(cxTitle);
    linked.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'metric-row';
      row.innerHTML = `<span class="label">${c.physicalMedium}</span><span class="value">${c.signalType}</span>`;
      const rm = document.createElement('button');
      rm.className = 'btn';
      rm.textContent = 'Disconnect';
      rm.onclick = () => state.removeConnection(c.id);
      row.appendChild(rm);
      body.appendChild(row);
    });
  }

  renderRoutingMatrix(body, state, inst.instanceId);

  const paths = enumerateSignalPaths(state.equipment, state.connections, catalog, state.routes).filter((p) =>
    p.hops.some((h) => h.instanceId === inst.instanceId)
  );
  if (paths.length) {
    const pt = document.createElement('div');
    pt.className = 'nav-section-title';
    pt.textContent = 'SIGNAL PATHS';
    body.appendChild(pt);
    paths.slice(0, 4).forEach((p) => {
      const box = document.createElement('div');
      box.className = 'badge-note';
      const rows = describePath(p, state.equipment, state.connections);
      box.innerHTML = `<b>${p.signalType}</b> ${p.complete ? '✓ Complete' : '✕ Broken'}<br>` +
        rows.map((r) => (r.kind === 'cable' ? `&nbsp;&nbsp;↓ ${r.text}` : r.text)).join('<br>');
      if (!p.complete && p.breakReason) box.innerHTML += `<br>${p.breakReason}`;
      body.appendChild(box);
    });
  }

  if (state.workspaceMode === 'system') {
    const roomBtn = document.createElement('button');
    roomBtn.className = 'btn';
    roomBtn.textContent = 'View in Room';
    roomBtn.onclick = () => state.viewInRoom();
    body.appendChild(roomBtn);
  }

  if (product.category === 'display') {
    renderDisplayAnalysisControls(body, state);
  }
  if (product.category === 'microphone') {
    renderMicAnalysisControls(body, state);
  }
  if (product.category === 'speaker') {
    renderAudioAnalysisControls(body, state);
  }
  if (product.category === 'camera') {
    renderCameraAnalysisControls(body, state);
  }
}

function appendCatalogLink(body: HTMLElement, state: AppState): void {
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Edit Catalog';
  btn.onclick = () => state.setDesignTool('catalog');
  body.appendChild(btn);
}

function renderConnectionInspector(body: HTMLElement, state: AppState, id: string): void {
  const c = state.connections.find((x) => x.id === id);
  if (!c) return;
  const src = state.equipment.find((e) => e.instanceId === c.fromInstanceId);
  const dst = state.equipment.find((e) => e.instanceId === c.toInstanceId);
  const srcPort = src ? resolveInstancePorts(src.instanceId, src.productId, catalog).find((p) => p.id === c.fromPortId) : undefined;
  const dstPort = dst ? resolveInstancePorts(dst.instanceId, dst.productId, catalog).find((p) => p.id === c.toPortId) : undefined;
  const route = cachedCableRoute(c, cableRouteContext(state, catalog));
  metricRow(body, 'Source', src ? `${src.name} · ${srcPort?.label ?? c.fromPortId}` : c.fromInstanceId);
  metricRow(body, 'Destination', dst ? `${dst.name} · ${dstPort?.label ?? c.toPortId}` : c.toInstanceId);
  metricRow(body, 'Signal', c.signalType);
  metricRow(body, 'Cable', cableTypeOf(c));
  metricRow(body, 'Transport', c.transport);
  metricRow(body, 'Route length', `${route.totalLength.toFixed(2)} m (${route.segments.length} segments)`);
  metricRow(body, 'Path type', route.pathType);
  const limit = state.cableLengthLimitsM[cableTypeOf(c)];
  metricRow(body, 'Length check', limit == null ? 'No configured limit' : route.totalLength > limit ? `Exceeds ${limit} m` : `Within ${limit} m`);
  metricRow(
    body,
    'Status',
    route.status === 'clear' ? '✓ Valid · route clear' : route.status === 'intersects-obstacle' ? '⚠ Route intersects obstacle' : 'No room geometry'
  );
  const srcBtn = document.createElement('button');
  srcBtn.className = 'btn';
  srcBtn.textContent = 'Focus Source';
  srcBtn.onclick = () => state.focusConnectionEndpoint('source');
  const dstBtn = document.createElement('button');
  dstBtn.className = 'btn';
  dstBtn.textContent = 'Focus Destination';
  dstBtn.onclick = () => state.focusConnectionEndpoint('destination');
  const show = document.createElement('button');
  show.className = 'btn primary';
  show.textContent = 'Show Route';
  show.onclick = () => state.showConnectionRoute(c.id);
  body.append(srcBtn, dstBtn, show);
  const disc = document.createElement('button');
  disc.className = 'btn';
  disc.textContent = 'Disconnect';
  disc.onclick = () => state.removeConnection(c.id);
  body.appendChild(disc);
}
