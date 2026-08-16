import type { AppState } from '../../app/AppState';
import { analyzeSeatAgainstDisplay, getActiveDisplay, projectObstacles } from '../../av/DesignAnalysis';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';
import { snapEquipment } from '../../interaction/SnapEngine';
import { renderDisplayAnalysisControls } from './DisplayAnalysisPanel';
import { renderMicAnalysisControls } from './MicAnalysisPanel';
import { renderAudioAnalysisControls } from './AudioAnalysisPanel';
import { renderCameraAnalysisControls } from './CameraAnalysisPanel';
import { resolveInstancePorts } from '../../system/PortResolver';
import { renderRoutingMatrix } from './RoutingMatrix';
import { describePath, enumerateSignalPaths } from '../../system/SignalPathEngine';
import { evaluateSeatMicCoverage } from '../../av/MicrophoneCoverageEngine';
import { resolveProjectMicrophones, usableMicPlacements } from '../../av/MicAnalysis';
import { analyzeSeatAudio } from '../../av/SpeakerAnalysis';
import { analyzeSeatCamera } from '../../av/CameraAnalysis';
import { SPL_TARGET_MAX, SPL_TARGET_MIN } from '../../av/SpeakerCoverageEngine';

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

function statusPill(status: 'pass' | 'warning' | 'fail'): HTMLElement {
  const el = document.createElement('span');
  el.className = `status-pill ${status}`;
  el.textContent = status.toUpperCase();
  return el;
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

  if (state.selection.kind === 'equipment' && state.selection.id) {
    title.textContent = 'PROPERTIES';
    renderEquipmentInspector(body, state, state.selection.id);
    return;
  }

  if (state.selection.kind === 'none' || !state.selection.id) {
    title.textContent = 'PROPERTIES';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<div class="empty-title">No object selected</div>
      <div class="empty-body">Select an AV object, seat, or table to inspect engineering data, position, orientation, simulation, and validation.</div>`;
    body.appendChild(empty);
    if (!state.room) {
      const hint = document.createElement('div');
      hint.className = 'badge-note';
      hint.textContent = 'Start in Design → Room.';
      body.appendChild(hint);
    }
    return;
  }
}

function renderTableInspector(body: HTMLElement, state: AppState, tableId: string): void {
  const table = state.tables.find((t) => t.id === tableId);
  if (!table) return;

  metricRow(body, 'Dimensions', `${(table.sizeX * 1000).toFixed(0)} × ${(table.sizeZ * 1000).toFixed(0)} mm`);
  metricRow(body, 'Height', `${((table.height ?? 0.73) * 1000).toFixed(0)} mm AFF`);
  if (table.furnitureId) metricRow(body, 'Template', table.furnitureId.replace(/generic-/, 'Generic '));
  metricRow(body, 'Center X', `${table.centerX.toFixed(2)} m`);
  metricRow(body, 'Center Z', `${table.centerZ.toFixed(2)} m`);
  const note = document.createElement('div');
  note.className = 'badge-note';
  note.textContent = 'Generic furniture template — not a manufacturer product. Placement snaps inside the room clearance envelope.';
  body.appendChild(note);

  numField(body, 'Position X (m)', table.centerX, 0.05, (v) => state.updateTable(tableId, { centerX: v }));
  numField(body, 'Position Z (m)', table.centerZ, 0.05, (v) => state.updateTable(tableId, { centerZ: v }));
}

function renderSeatInspector(body: HTMLElement, state: AppState, seatId: string): void {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat) return;

  numField(body, 'Position X (m)', seat.x, 0.05, (v) => state.updateSeat(seatId, { x: v }));
  numField(body, 'Position Z (m)', seat.z, 0.05, (v) => state.updateSeat(seatId, { z: v }));
  numField(body, 'Rotation (°)', (seat.facing * 180) / Math.PI, 5, (v) =>
    state.updateSeat(seatId, { facing: (v * Math.PI) / 180 })
  );

  const display = getActiveDisplay(state.equipment, catalog);
  if (!display) {
    const note = document.createElement('div');
    note.className = 'inspector-empty';
    note.textContent = 'No display placed yet — add one in the Equipment step to see viewing analysis for this seat.';
    body.appendChild(note);
    return;
  }

  const analysis = analyzeSeatAgainstDisplay(display, seat, projectObstacles(state.room, state.tables));

  metricRow(body, 'Distance to display', `${analysis.distance.value} m`);
  metricRow(body, 'Horizontal angle', `${analysis.horizontalAngle.value}°`, statusPill(analysis.horizontalAngle.status));
  metricRow(body, 'Vertical angle', `${analysis.verticalAngle.value}°`, statusPill(analysis.verticalAngle.status));
  metricRow(body, 'Viewing distance', `${analysis.viewingDistance.value} m`, statusPill(analysis.viewingDistance.status));
  metricRow(body, 'Visibility', analysis.visibility.value.replace('_', ' '), statusPill(analysis.visibility.status));
  metricRow(body, 'Sightline', analysis.sightline.value, statusPill(analysis.sightline.status));

  const overall = document.createElement('div');
  overall.className = 'badge-note';
  overall.innerHTML = `Overall: ${statusPill(analysis.overall).outerHTML}<br><br><b>Methodology:</b> ${analysis.viewingDistance.method}`;
  body.appendChild(overall);

  if (analysis.sightline.status === 'fail') {
    const blocked = document.createElement('div');
    blocked.className = 'badge-note';
    blocked.style.color = 'var(--danger)';
    blocked.textContent = analysis.sightline.method;
    body.appendChild(blocked);
  }

  const viewerBtn = document.createElement('button');
  viewerBtn.className = 'btn primary';
  viewerBtn.textContent = 'View from this seat';
  viewerBtn.onclick = () => state.enterViewerMode(seat.id);
  body.appendChild(viewerBtn);

  const mics = usableMicPlacements(resolveProjectMicrophones(state.equipment, catalog));
  if (mics.length) {
    const micR = evaluateSeatMicCoverage({ seatId: seat.id, x: seat.x, z: seat.z }, mics);
    metricRow(
      body,
      'Mic pickup',
      micR.covered
        ? `inside · ${micR.nearestDistanceM ?? '—'} m${micR.angularDeltaDeg != null ? ` · ${micR.angularDeltaDeg}°` : ''}`
        : `outside · ${micR.nearestDistanceM ?? '—'} m`,
      statusPill(micR.status)
    );
    const micNote = document.createElement('div');
    micNote.className = 'badge-note';
    micNote.textContent = micR.criterion;
    body.appendChild(micNote);
  }

  const audio = analyzeSeatAudio(seat, state.equipment, catalog);
  if (state.equipment.some((e) => catalog.get(e.productId)?.category === 'speaker')) {
    metricRow(
      body,
      'Estimated SPL',
      audio.splAtSeat != null ? `${audio.splAtSeat} dB @ ${audio.distanceM ?? '—'} m` : 'outside dispersion / DATA INCOMPLETE',
      statusPill(audio.status)
    );
    metricRow(body, 'Required SPL band', `${SPL_TARGET_MIN}–${SPL_TARGET_MAX} dB (engineering estimate)`);
    const audioNote = document.createElement('div');
    audioNote.className = 'badge-note';
    audioNote.textContent = 'ENGINEERING ESTIMATE — free-field + catalog dispersion. Not room-acoustic simulation.';
    body.appendChild(audioNote);
  }

  if (state.equipment.some((e) => catalog.get(e.productId)?.category === 'camera')) {
    const cam = analyzeSeatCamera(seat, state.equipment, catalog, state.room, state.tables);
    const camIds = cam.visible ? cam.coveringCameraIds : cam.inFov ? cam.blockingCameraIds : [];
    metricRow(body, 'Camera FOV', cam.inFov ? 'PASS' : 'FAIL');
    metricRow(body, 'Camera sightline', cam.sightline.toUpperCase());
    metricRow(
      body,
      'Camera coverage',
      cam.visible ? `visible · ${camIds.join(', ') || '—'}` : cam.inFov ? `blocked · ${camIds.join(', ')}` : 'outside FOV',
      statusPill(cam.status)
    );
    const camNote = document.createElement('div');
    camNote.className = 'badge-note';
    camNote.textContent = 'GEOMETRIC FRUSTUM ESTIMATE — catalog HFOV + SightlineEngine. Not image quality or NVR simulation.';
    body.appendChild(camNote);
  }
}

function renderEquipmentInspector(body: HTMLElement, state: AppState, instanceId: string): void {
  const inst = state.equipment.find((e) => e.instanceId === instanceId);
  if (!inst) return;
  const product = catalog.get(inst.productId);
  if (!product) return;

  const prov = document.createElement('span');
  prov.className = `provenance ${product.provenance}`;
  prov.textContent = `${product.provenance.replace('_', ' ')} data`;
  body.appendChild(prov);

  metricRow(body, 'Manufacturer', product.manufacturer);
  metricRow(body, 'Model', product.model);
  const nameField = document.createElement('div');
  nameField.className = 'field';
  const nameLbl = document.createElement('label');
  nameLbl.textContent = 'Instance name';
  const nameIn = document.createElement('input');
  nameIn.value = inst.name;
  nameIn.onchange = () => state.updateEquipment(instanceId, { name: nameIn.value, placementMode: inst.placementMode });
  nameField.append(nameLbl, nameIn);
  body.appendChild(nameField);

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
  if (incomplete) appendCatalogLink(body, state);

  if (product.display) {
    metricRow(body, 'Size', `${product.display.diagonalInches}"`);
    metricRow(body, 'Resolution', product.display.resolution);
  }
  if (product.microphone) {
    metricRow(body, 'Pickup radius', `${product.microphone.pickupRadiusM} m`);
    if (product.microphone.beamWidthDeg != null) {
      metricRow(body, 'Beam width', `${product.microphone.beamWidthDeg}°`);
    }
    metricRow(body, 'Coverage model', product.microphone.coverageModel ?? 'omni (disc if radius present)');
    metricRow(body, 'Pattern (catalog text)', product.microphone.pattern);
    metricRow(body, 'Mount', product.microphone.mount);
  }
  if (product.speaker) {
    metricRow(
      body,
      'Max SPL @ 1 m',
      product.speaker.maxSplAt1m != null ? `${product.speaker.maxSplAt1m} dB` : 'DATA INCOMPLETE'
    );
    metricRow(
      body,
      'Dispersion',
      product.speaker.dispersionDeg != null
        ? `${product.speaker.dispersionDeg}°`
        : product.speaker.horizontalDispersionDeg != null && product.speaker.verticalDispersionDeg != null
          ? `${product.speaker.horizontalDispersionDeg}° H / ${product.speaker.verticalDispersionDeg}° V`
          : 'DATA INCOMPLETE'
    );
    if (product.speaker.horizontalDispersionDeg != null) {
      metricRow(body, 'Horizontal dispersion', `${product.speaker.horizontalDispersionDeg}°`);
    }
    if (product.speaker.verticalDispersionDeg != null) {
      metricRow(body, 'Vertical dispersion', `${product.speaker.verticalDispersionDeg}°`);
    }
  }
  if (product.camera) {
    metricRow(
      body,
      'Horizontal FOV',
      product.camera.horizontalFovDeg != null ? `${product.camera.horizontalFovDeg}°` : 'DATA INCOMPLETE'
    );
    metricRow(
      body,
      'Vertical FOV',
      product.camera.verticalFovDeg != null ? `${product.camera.verticalFovDeg}°` : 'not in catalog (not invented)'
    );
    metricRow(body, 'Mount', product.camera.mount);
  }

  numField(body, 'Position X (m)', inst.position.x, 0.01, (v) =>
    state.updateEquipment(instanceId, { position: { ...inst.position, x: v } })
  );
  numField(body, 'Position Y / Height (m)', inst.position.y, 0.01, (v) =>
    state.updateEquipment(instanceId, { position: { ...inst.position, y: v } })
  );
  numField(body, 'Position Z (m)', inst.position.z, 0.01, (v) =>
    state.updateEquipment(instanceId, { position: { ...inst.position, z: v } })
  );
  numField(body, 'Rotation Y (°)', (inst.rotationY * 180) / Math.PI, 5, (v) =>
    state.updateEquipment(instanceId, { rotationY: (v * Math.PI) / 180 })
  );

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
  metricRow(body, 'Source', src ? `${src.name}` : c.fromInstanceId);
  metricRow(body, 'Destination', dst ? `${dst.name}` : c.toInstanceId);
  metricRow(body, 'Signal', c.signalType);
  metricRow(body, 'Transport', c.transport);
  metricRow(body, 'Physical medium', c.physicalMedium);
  metricRow(body, 'Status', '✓ Connected');
  const disc = document.createElement('button');
  disc.className = 'btn';
  disc.textContent = 'Disconnect';
  disc.onclick = () => state.removeConnection(c.id);
  body.appendChild(disc);
  const room = document.createElement('button');
  room.className = 'btn';
  room.textContent = 'View source in Room';
  room.onclick = () => {
    state.select('equipment', c.fromInstanceId);
    state.viewInRoom();
  };
  body.appendChild(room);
}
