import type { AppState } from '../../app/AppState';
import { renderDesignPanel } from '../panels/DesignPanel';
import { renderInspectorPanel } from '../panels/InspectorPanel';
import { renderStatusBar } from '../panels/StatusBar';
import { renderViewerModeOverlay } from '../panels/ViewerModeOverlay';
import { renderPlanView } from '../panels/PlanRenderer';
import { renderElevationView } from '../panels/ElevationRenderer';
import { renderObjectBrowser } from '../panels/ObjectBrowser';
import { renderContextToolbar } from '../panels/ContextToolbar';
import { renderSystemCanvas } from '../panels/SystemCanvas';
import { renderAutoDesignOverlay } from '../panels/AutoDesignPanel';
import { renderDesignAssistant } from '../panels/DesignAssistantPanel';
import { renderProjectSetupOverlay } from '../panels/ProjectSetupOverlay';
import { downloadProject } from '../../app/ProjectStore';
import { validationReportFor } from '../../av/validation/validationCache';
import type { ShellNav } from '../workspace/projectSetup';

export interface LayoutRefs {
  viewportEl: HTMLElement;
}

const SHELL_TABS: Array<[ShellNav, string]> = [
  ['project', 'Project'],
  ['design', 'Design'],
  ['system', 'System'],
  ['simulate', 'Simulate'],
  ['validate', 'Validate']
];

export function buildLayout(root: HTMLElement, state: AppState): LayoutRefs {
  root.innerHTML = '';

  const topbar = document.createElement('div');
  topbar.className = 'topbar';
  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.textContent = 'SIMSTAGE';
  const modeSwitch = document.createElement('nav');
  modeSwitch.className = 'workspace-mode';
  modeSwitch.setAttribute('aria-label', 'Workspace');
  const projectName = document.createElement('input');
  projectName.className = 'project-name';
  projectName.title = 'Project name';
  const complexity = document.createElement('button');
  complexity.type = 'button';
  complexity.className = 'topbar-ghost';
  const newBtn = document.createElement('button');
  newBtn.textContent = 'New';
  newBtn.className = 'topbar-ghost';
  newBtn.onclick = () => state.openNewProject();
  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export';
  exportBtn.className = 'topbar-ghost';
  exportBtn.onclick = () => downloadProject(state);
  const autoBtn = document.createElement('button');
  autoBtn.textContent = 'Auto Design';
  autoBtn.className = 'topbar-auto';
  autoBtn.onclick = () => state.requestAutoDesign();
  const healthChip = document.createElement('span');
  healthChip.className = 'health-chip';
  topbar.append(brand, modeSwitch, projectName, complexity, healthChip, autoBtn, newBtn, exportBtn);

  const mainLayout = document.createElement('div');
  mainLayout.className = 'main-layout';

  const panelLeft = document.createElement('aside');
  panelLeft.className = 'panel-left';
  panelLeft.dataset.panel = 'project';
  const leftHead = document.createElement('div');
  leftHead.className = 'panel-head';
  leftHead.textContent = 'Project';
  const objectBrowserEl = document.createElement('div');
  objectBrowserEl.className = 'object-browser';
  const designPanelEl = document.createElement('div');
  designPanelEl.className = 'design-panel-body';
  panelLeft.append(leftHead, objectBrowserEl, designPanelEl);

  const viewportWrap = document.createElement('div');
  viewportWrap.className = 'viewport-wrap';
  const viewportChrome = document.createElement('div');
  viewportChrome.className = 'viewport-chrome';
  const viewSwitch = document.createElement('div');
  viewSwitch.className = 'viewmode-switch';
  (['3d', 'plan', 'elevation'] as const).forEach((mode) => {
    const b = document.createElement('button');
    b.textContent = mode === '3d' ? '3D' : mode === 'plan' ? 'Plan' : 'Elevation';
    b.onclick = () => state.setViewMode(mode);
    viewSwitch.appendChild(b);
  });
  const contextToolbarEl = document.createElement('div');
  contextToolbarEl.className = 'context-toolbar-wrap';
  viewportChrome.append(viewSwitch, contextToolbarEl);

  const viewportStage = document.createElement('div');
  viewportStage.className = 'viewport-stage';
  const viewportCanvas = document.createElement('div');
  viewportCanvas.id = 'viewport-canvas';
  const planContainer = document.createElement('div');
  planContainer.className = 'flat-view-canvas';
  const elevationContainer = document.createElement('div');
  elevationContainer.className = 'flat-view-canvas';
  const systemContainer = document.createElement('div');
  systemContainer.className = 'system-canvas-host';
  const viewerModeLayer = document.createElement('div');
  viewportStage.append(viewportCanvas, planContainer, elevationContainer, systemContainer, viewerModeLayer);
  viewportWrap.append(viewportChrome, viewportStage);

  const panelRight = document.createElement('aside');
  panelRight.className = 'panel-right';
  panelRight.dataset.panel = 'properties';
  const rightHead = document.createElement('div');
  rightHead.className = 'panel-head';
  rightHead.textContent = 'Properties';
  const inspectorHost = document.createElement('div');
  inspectorHost.className = 'inspector-host';
  panelRight.append(rightHead, inspectorHost);
  mainLayout.append(panelLeft, viewportWrap, panelRight);

  const statusBar = document.createElement('div');
  statusBar.className = 'statusbar';
  root.append(topbar, mainLayout, statusBar);

  function renderModeSwitch(): void {
    modeSwitch.innerHTML = '';
    SHELL_TABS.forEach(([id, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = state.shellNav === id ? 'active' : '';
      b.onclick = () => state.setShellNav(id);
      modeSwitch.appendChild(b);
    });
  }

  function renderFindingHud(): void {
    let hud = viewportStage.querySelector('.finding-hud') as HTMLElement | null;
    if (!hud) {
      hud = document.createElement('div');
      hud.className = 'finding-hud';
      viewportStage.appendChild(hud);
    }
    hud.innerHTML = '';
    if (!state.selectedFindingId) {
      hud.style.display = 'none';
      return;
    }
    const report = validationReportFor(state);
    const f = report.findings.find((x) => x.id === state.selectedFindingId);
    if (!f || f.severity === 'pass') {
      hud.style.display = 'none';
      return;
    }
    hud.style.display = '';
    hud.innerHTML = `<div class="finding-hud-code">${f.code}</div>
      <div>${f.title}</div>
      <div class="muted">${f.metric ? `${f.metric.actual}  ·  ${f.metric.expected}` : f.message}</div>`;
    if (f.category === 'system' && f.affectedObjects.some((o) => o.kind === 'equipment')) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = 'View in Room';
      b.onclick = () => {
        const eq = f.affectedObjects.find((o) => o.kind === 'equipment');
        if (eq) state.select('equipment', eq.id);
        state.viewInRoom();
      };
      hud.appendChild(b);
    }
  }

  function renderAll(): void {
    renderModeSwitch();
    projectName.value = state.project.name;
    projectName.oninput = () => {
      state.project.name = projectName.value;
    };
    complexity.textContent = state.uiComplexity === 'beginner' ? 'Beginner' : 'Pro';
    complexity.title = 'Same project. Beginner hides extra engineering chrome.';
    complexity.onclick = () => state.setUiComplexity(state.uiComplexity === 'beginner' ? 'pro' : 'beginner');
    panelLeft.classList.toggle('beginner', state.uiComplexity === 'beginner');
    const report = validationReportFor(state);
    healthChip.className = 'health-chip ' + report.summary.designStatus;
    healthChip.textContent =
      report.summary.designStatus === 'pass'
        ? `✓ ${report.summary.passCount}`
        : `⚠ ${report.summary.warningCount}  ✕ ${report.summary.errorCount}`;
    healthChip.title = 'Design health counts — not a scored percentage';
    healthChip.onclick = () => state.setShellNav('validate');

    renderObjectBrowser(objectBrowserEl, state);
    renderDesignPanel(designPanelEl, state);
    renderInspectorPanel(inspectorHost, state);
    renderStatusBar(statusBar, state);
    renderContextToolbar(contextToolbarEl, state);
    renderFindingHud();
    renderAutoDesignOverlay(viewportStage, state);
    renderProjectSetupOverlay(viewportStage, state);
    if (state.uiComplexity === 'pro') renderDesignAssistant(viewportStage, state);
    else {
      const asst = viewportStage.querySelector('.ad-assistant');
      if (asst) asst.remove();
    }

    const system = state.workspaceMode === 'system';
    viewportCanvas.style.display = !system && state.viewMode === '3d' ? '' : 'none';
    planContainer.style.display = !system && state.viewMode === 'plan' ? '' : 'none';
    elevationContainer.style.display = !system && state.viewMode === 'elevation' ? '' : 'none';
    systemContainer.style.display = system ? '' : 'none';
    viewSwitch.style.display = system ? 'none' : '';
    if (!system && state.viewMode === 'plan') renderPlanView(planContainer, state);
    if (!system && state.viewMode === 'elevation') renderElevationView(elevationContainer, state);
    if (system) renderSystemCanvas(systemContainer, state);
    viewerModeLayer.style.display = !system && state.viewMode === '3d' ? '' : 'none';
    renderViewerModeOverlay(viewerModeLayer, state);
    Array.from(viewSwitch.children).forEach((child, i) => {
      const mode = (['3d', 'plan', 'elevation'] as const)[i];
      child.classList.toggle('active', state.viewMode === mode);
    });
  }

  state.subscribe(renderAll);
  renderAll();

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      state.undo();
      return;
    }
    if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      state.redo();
      return;
    }
    if (typing) return;
    if (e.key === '1') state.setViewMode('3d');
    else if (e.key === '2') state.setViewMode('plan');
    else if (e.key === '3') state.setViewMode('elevation');
    else if (e.key === 'f' || e.key === 'F') state.requestFocus();
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      state.deleteSelected();
    } else if (e.key === 'Escape') {
      if (state.setupOpen) state.closeSetup();
      else if (state.viewerMode.active) state.exitViewerMode();
      else state.select('none', null);
    }
  });

  return { viewportEl: viewportCanvas };
}
