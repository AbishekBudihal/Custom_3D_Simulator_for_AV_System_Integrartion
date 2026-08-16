/**
 * SceneManager.ts
 * Owns the Three.js scene/renderer lifecycle. Reacts to AppState
 * changes (room, seats, equipment, selection, viewer mode) by
 * rebuilding only the groups that changed.
 *
 * Phase A adds TransformControls for direct manipulation of AV
 * equipment, intelligent snapping on drag end, and focus-on-selection.
 */

import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { AppState } from '../app/AppState';
import { generateRoomGeometry } from '../room/RoomGenerator';
import { renderSeating } from '../room/SeatingRenderer';
import { renderEquipment } from '../room/EquipmentRenderer';
import { CameraController } from './CameraController';
import { loadDefaultCatalog } from '../catalog/loadCatalog';
import type { CheckStatus, DisplayPlacement } from '../av/ViewingDistanceEngine';
import { DEFAULT_EYE_HEIGHT_M, getActiveDisplay, computeSeatStatuses, projectObstacles } from '../av/DesignAnalysis';
import { computeViewerPose } from '../av/ViewerPose';
import { cachedCoverage } from '../av/coverageCache';
import { cachedMicCoverage } from '../av/micCoverageCache';
import { overlayLayerForFinding } from '../av/simulation/AnalysisLayer';
import { addFloorHeatmap } from './HeatmapMesh';
import { addPickupRegionOverlay } from './PickupRegionMesh';
import { STATUS_RGB } from '../av/HeatmapEngine';
import { snapEquipment } from '../interaction/SnapEngine';
import {
  computeSeatMicStatuses,
  resolveProjectMicrophones,
  usableMicPlacements
} from '../av/MicAnalysis';
import { cachedSpeakerCoverage } from '../av/speakerCoverageCache';
import {
  computeSeatAudioStatuses,
  resolveProjectSpeakers,
  usableSpeakerPlacements
} from '../av/SpeakerAnalysis';
import { cachedCameraCoverage } from '../av/cameraCoverageCache';
import {
  computeSeatCameraStatuses,
  resolveProjectCameras,
  summarizeCameraCoverage,
  usableCameraPlacements
} from '../av/CameraAnalysis';

const catalog = loadDefaultCatalog();

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly cameraController: CameraController;

  private roomGroup = new THREE.Group();
  private seatingGroup = new THREE.Group();
  private equipmentGroup = new THREE.Group();
  private analysisGroup = new THREE.Group();
  private transformControls: TransformControls;
  private selectedMesh: THREE.Object3D | null = null;
  private heatmapMesh: THREE.Mesh | null = null;

  private lastRoomSignature = '';
  private lastSeatsSignature = '';
  private lastEquipSignature = '';
  private lastSelectionSignature = '';
  private lastViewerSignature = '';
  private lastTransformMode = '';
  private lastFocusRequest = 0;
  private lastFindingFocus = 0;
  private lastAnalysisSignature = '';
  private lastVizBuildSignature = '';
  private dragging = false;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  constructor(private container: HTMLElement, private state: AppState) {
    this.scene.background = new THREE.Color(0xf2f1ee);
    this.scene.add(this.roomGroup, this.seatingGroup, this.equipmentGroup, this.analysisGroup);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.cameraController = new CameraController(container);

    this.transformControls = new TransformControls(this.cameraController.camera, this.renderer.domElement);
    this.transformControls.setSize(0.85);
    this.transformControls.addEventListener('dragging-changed', (e) => {
      this.dragging = (e as { value: boolean }).value;
      this.cameraController.controls.enabled = !this.dragging;
      if (this.dragging) this.state.prepareHistory();
    });
    this.transformControls.addEventListener('objectChange', () => this.onTransformChange());
    this.scene.add(this.transformControls);

    this.setupLighting();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));

    state.subscribe(() => this.sync());
    this.sync();
    this.animate();
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x60564a, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(6, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    this.scene.add(sun);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.cameraController.setAspect(w / h);
  }

  private activeDisplay(): DisplayPlacement | null {
    return getActiveDisplay(this.state.equipment, catalog);
  }

  private sync(): void {
    const room = this.state.room;
    if (room) {
      const sig = JSON.stringify(room);
      if (sig !== this.lastRoomSignature) {
        this.lastRoomSignature = sig;
        while (this.roomGroup.children.length) this.roomGroup.remove(this.roomGroup.children[0]);
        this.roomGroup.add(generateRoomGeometry(room));
        if (!this.state.viewerMode.active) this.cameraController.frameRoom(room.width, room.depth, room.height);
      }
    }

    const seatsSig = JSON.stringify(this.state.seats) + JSON.stringify(this.state.tables);
    const equipSig = JSON.stringify(this.state.equipment);
    const selectionSig = JSON.stringify(this.state.selection) + JSON.stringify(this.state.highlightedSeatIds);
    const analysisSig =
      JSON.stringify(this.state.displayAnalysis) +
      JSON.stringify(this.state.micAnalysis) +
      JSON.stringify(this.state.audioAnalysis) +
      JSON.stringify(this.state.cameraAnalysis);
    const needsSeatRebuild =
      seatsSig !== this.lastSeatsSignature ||
      equipSig !== this.lastEquipSignature ||
      selectionSig !== this.lastSelectionSignature ||
      analysisSig !== this.lastAnalysisSignature;

    if (needsSeatRebuild) {
      const showMicStatus = this.state.micAnalysis.enabled && this.state.micAnalysis.seatStatus;
      const showAudioStatus = this.state.audioAnalysis.enabled && this.state.audioAnalysis.seatStatus;
      const showCameraStatus = this.state.cameraAnalysis.enabled && this.state.cameraAnalysis.seatStatus;
      const showDisplayStatus =
        (this.state.displayAnalysis.enabled && this.state.displayAnalysis.seatStatus) ||
        this.state.highlightedSeatIds.length > 0;
      const showStatus = showMicStatus || showAudioStatus || showCameraStatus || showDisplayStatus;
      const obstacles = projectObstacles(this.state.room, this.state.tables);
      const statuses = showMicStatus
        ? computeSeatMicStatuses(this.state.seats, this.state.equipment, catalog)
        : showAudioStatus
          ? computeSeatAudioStatuses(this.state.seats, this.state.equipment, catalog)
          : showCameraStatus
            ? computeSeatCameraStatuses(this.state.seats, this.state.equipment, catalog, this.state.room, this.state.tables)
            : showStatus
              ? computeSeatStatuses(this.state.seats, this.activeDisplay(), obstacles)
              : new Map<string, CheckStatus>();
      const selectedIds = [
        ...(this.state.selection.kind === 'seat' && this.state.selection.id ? [this.state.selection.id] : []),
        ...this.state.highlightedSeatIds
      ];
      while (this.seatingGroup.children.length) this.seatingGroup.remove(this.seatingGroup.children[0]);
      this.seatingGroup.add(renderSeating(this.state.seats, this.state.tables, showStatus ? statuses : undefined, selectedIds));
    }

    if (equipSig !== this.lastEquipSignature || selectionSig !== this.lastSelectionSignature) {
      const selectedEquipId = this.state.selection.kind === 'equipment' ? this.state.selection.id : null;
      while (this.equipmentGroup.children.length) this.equipmentGroup.remove(this.equipmentGroup.children[0]);
      this.equipmentGroup.add(
        renderEquipment(
          this.state.equipment.filter((e) => !this.state.hiddenEquipmentIds.includes(e.instanceId)),
          catalog,
          selectedEquipId
        )
      );
      this.attachTransformToSelection();
    }

    this.lastSeatsSignature = seatsSig;
    this.lastEquipSignature = equipSig;
    this.lastSelectionSignature = selectionSig;
    this.lastAnalysisSignature = analysisSig;

    if (this.state.transformMode !== this.lastTransformMode) {
      this.lastTransformMode = this.state.transformMode;
      this.transformControls.setMode(this.state.transformMode);
    }

    if (this.state.focusRequest !== this.lastFocusRequest) {
      this.lastFocusRequest = this.state.focusRequest;
      this.focusSelection();
    }
    if (this.state.findingFocusRequest !== this.lastFindingFocus) {
      this.lastFindingFocus = this.state.findingFocusRequest;
      this.focusFinding();
    }

    this.syncViewerMode();
    this.updateTransformVisibility();
    const vizBuildSig =
      JSON.stringify(this.state.displayAnalysis) +
      JSON.stringify(this.state.micAnalysis) +
      JSON.stringify(this.state.audioAnalysis) +
      JSON.stringify(this.state.cameraAnalysis) +
      JSON.stringify(this.state.equipment) +
      JSON.stringify(this.state.highlightedSeatIds) +
      JSON.stringify(this.state.tables) +
      JSON.stringify(this.state.room) +
      JSON.stringify(this.state.seats);
    if (vizBuildSig !== this.lastVizBuildSignature) {
      this.lastVizBuildSignature = vizBuildSig;
      this.syncAnalysisViz();
    }
  }

  private clearAnalysisGroup(): void {
    while (this.analysisGroup.children.length) {
      const child = this.analysisGroup.children[0];
      this.analysisGroup.remove(child);
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) {
        const map = (mat as THREE.MeshBasicMaterial).map;
        if (map) map.dispose();
        mat.dispose();
      }
    }
    this.heatmapMesh = null;
  }

  private syncAnalysisViz(): void {
    const viz = this.state.displayAnalysis;
    const micViz = this.state.micAnalysis;
    const audioViz = this.state.audioAnalysis;
    const cameraViz = this.state.cameraAnalysis;
    const display = this.activeDisplay();
    const room = this.state.room;
    const needDisplay = viz.enabled && !!display && !!room;
    const needMic = micViz.enabled && !!room;
    const needAudio = audioViz.enabled && !!room;
    const needCamera = cameraViz.enabled && !!room;
    if (!needDisplay && !needMic && !needAudio && !needCamera) {
      this.clearAnalysisGroup();
      return;
    }

    this.clearAnalysisGroup();
    const obstacles = projectObstacles(room!, this.state.tables);

    if (needCamera && cameraViz.heatmap && room) {
      const cameras = usableCameraPlacements(resolveProjectCameras(this.state.equipment, catalog));
      const { grid, image } = cachedCameraCoverage(room, cameras, obstacles, cameraViz.samplingQuality);
      this.heatmapMesh = addFloorHeatmap(this.analysisGroup, room, grid, image);
    } else if (needAudio && audioViz.heatmap && room) {
      const speakers = usableSpeakerPlacements(resolveProjectSpeakers(this.state.equipment, catalog));
      const { grid, image } = cachedSpeakerCoverage(room, speakers, audioViz.samplingQuality);
      this.heatmapMesh = addFloorHeatmap(this.analysisGroup, room, grid, image);
    } else if (needMic && micViz.heatmap && room) {
      const mics = usableMicPlacements(resolveProjectMicrophones(this.state.equipment, catalog));
      const { grid, image } = cachedMicCoverage(room, mics, micViz.samplingQuality);
      this.heatmapMesh = addFloorHeatmap(this.analysisGroup, room, grid, image);
    } else if (needDisplay && viz.heatmap && display && room) {
      const { grid, image } = cachedCoverage(room, display, obstacles, viz.samplingQuality);
      this.heatmapMesh = addFloorHeatmap(this.analysisGroup, room, grid, image);
    }

    if (needCamera && cameraViz.fovRegions && room) {
      resolveProjectCameras(this.state.equipment, catalog).forEach((cam) => {
        if (!cam.coverageRegion) return;
        const selected = this.state.selection.kind === 'equipment' && this.state.selection.id === cam.instanceId;
        addPickupRegionOverlay(this.analysisGroup, cam.coverageRegion, selected, 0x6b5cff);
      });
    }

    if (needCamera && cameraViz.blockedSightlines && room) {
      const summary = summarizeCameraCoverage(
        this.state.seats,
        this.state.equipment,
        catalog,
        room,
        this.state.tables
      );
      const highlight = this.state.highlightedSeatIds;
      summary.seatResults
        .filter((r) => r.inFov && !r.visible)
        .filter((r) => highlight.length === 0 || highlight.includes(r.seatId))
        .forEach((r) => {
          const camId = r.blockingCameraIds[0];
          const cam = this.state.equipment.find((e) => e.instanceId === camId);
          const seat = this.state.seats.find((s) => s.id === r.seatId);
          if (!cam || !seat) return;
          const geom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(seat.x, DEFAULT_EYE_HEIGHT_M, seat.z),
            new THREE.Vector3(cam.position.x, cam.position.y, cam.position.z)
          ]);
          this.analysisGroup.add(
            new THREE.Line(
              geom,
              new THREE.LineBasicMaterial({ color: 0xd6483f, transparent: true, opacity: 0.9 })
            )
          );
        });
    }

    if (needAudio && audioViz.coverageRegions && room) {
      resolveProjectSpeakers(this.state.equipment, catalog).forEach((sp) => {
        if (!sp.coverageRegion) return;
        const selected = this.state.selection.kind === 'equipment' && this.state.selection.id === sp.instanceId;
        addPickupRegionOverlay(this.analysisGroup, sp.coverageRegion, selected, 0xd68c32);
      });
    }

    if (needMic && micViz.pickupRegions && room) {
      const resolved = resolveProjectMicrophones(this.state.equipment, catalog);
      resolved.forEach((mic) => {
        if (!mic.pickupRegion) return;
        const selected = this.state.selection.kind === 'equipment' && this.state.selection.id === mic.instanceId;
        addPickupRegionOverlay(this.analysisGroup, mic.pickupRegion, selected);
      });
    }

    if (needDisplay && display && (viz.sightlines !== 'off' || this.state.highlightedSeatIds.length) && overlayLayerForFinding(this.state.selectedFindingId ?? '') === 'display') {
      const highlight = this.state.highlightedSeatIds;
      const seats =
        highlight.length
          ? this.state.seats.filter((s) => highlight.includes(s.id))
          : viz.sightlines === 'selected' && this.state.selection.kind === 'seat' && this.state.selection.id
            ? this.state.seats.filter((s) => s.id === this.state.selection.id)
            : viz.sightlines === 'all'
              ? this.state.seats
              : [];
      const statuses = computeSeatStatuses(this.state.seats, display, obstacles);
      seats.forEach((seat) => {
        const status = statuses.get(seat.id) ?? 'fail';
        const [r, g, b] = STATUS_RGB[status];
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(seat.x, DEFAULT_EYE_HEIGHT_M, seat.z),
          new THREE.Vector3(display.position.x, display.position.y, display.position.z)
        ]);
        const line = new THREE.Line(
          geom,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(r / 255, g / 255, b / 255),
            transparent: true,
            opacity: 0.85
          })
        );
        this.analysisGroup.add(line);
      });
    }
  }

  private updateTransformVisibility(): void {
    const show =
      this.state.viewMode === '3d' &&
      !this.state.viewerMode.active &&
      this.state.selection.kind === 'equipment' &&
      !!this.selectedMesh;
    this.transformControls.visible = show;
    if (!show) {
      this.transformControls.detach();
    } else if (this.selectedMesh && this.transformControls.object !== this.selectedMesh) {
      this.transformControls.attach(this.selectedMesh);
    }
  }

  private attachTransformToSelection(): void {
    this.selectedMesh = null;
    if (this.state.selection.kind !== 'equipment' || !this.state.selection.id) {
      this.transformControls.detach();
      return;
    }
    const id = this.state.selection.id;
    this.equipmentGroup.traverse((obj) => {
      if (obj.userData?.instanceId === id && !this.selectedMesh) {
        this.selectedMesh = obj;
      }
    });
    if (this.selectedMesh) {
      this.transformControls.attach(this.selectedMesh);
      this.transformControls.setMode(this.state.transformMode);
    }
  }

  private onTransformChange(): void {
    if (!this.selectedMesh || this.state.selection.kind !== 'equipment' || !this.state.selection.id || !this.state.room) return;
    const id = this.state.selection.id;
    const inst = this.state.equipment.find((e) => e.instanceId === id);
    const product = inst ? catalog.get(inst.productId) : null;
    if (!inst || !product) return;

    if (this.dragging) {
      this.state.updateEquipment(
        id,
        {
          position: {
            x: Number(this.selectedMesh.position.x.toFixed(3)),
            y: Number(this.selectedMesh.position.y.toFixed(3)),
            z: Number(this.selectedMesh.position.z.toFixed(3))
          },
          rotationY: this.selectedMesh.rotation.y,
          placementMode: 'manual'
        },
        { recordHistory: false }
      );
      return;
    }

    const snapped = snapEquipment(
      this.state.room,
      product,
      {
        x: this.selectedMesh.position.x,
        y: this.selectedMesh.position.y,
        z: this.selectedMesh.position.z
      },
      this.selectedMesh.rotation.y
    );

    this.selectedMesh.position.set(snapped.position.x, snapped.position.y, snapped.position.z);
    this.selectedMesh.rotation.y = snapped.rotationY;

    this.state.updateEquipment(
      id,
      {
        position: snapped.position,
        rotationY: snapped.rotationY,
        wall: snapped.wall,
        placementMode: 'manual'
      },
      { recordHistory: false }
    );
    this.state.setSnapNote(snapped.note);
    this.state.finishGesture();
  }

  private focusSelection(): void {
    const room = this.state.room;
    if (!room) return;

    if (this.state.selection.kind === 'equipment' && this.state.selection.id) {
      const inst = this.state.equipment.find((e) => e.instanceId === this.state.selection.id);
      if (inst) {
        const pos = new THREE.Vector3(inst.position.x, inst.position.y, inst.position.z);
        this.cameraController.camera.position.set(pos.x + 2, pos.y + 1.5, pos.z + 2);
        this.cameraController.controls.target.copy(pos);
        this.cameraController.controls.update();
        return;
      }
    }

    if (this.state.selection.kind === 'seat' && this.state.selection.id) {
      const seat = this.state.seats.find((s) => s.id === this.state.selection.id);
      if (seat) {
        this.cameraController.camera.position.set(seat.x + 1.5, 2, seat.z + 1.5);
        this.cameraController.controls.target.set(seat.x, 1, seat.z);
        this.cameraController.controls.update();
        return;
      }
    }

    this.cameraController.frameRoom(room.width, room.depth, room.height);
  }

  private focusFinding(): void {
    const ids = this.state.highlightedSeatIds;
    const seats = this.state.seats.filter((s) => ids.includes(s.id));
    if (seats.length && this.state.room) {
      const x = seats.reduce((a, s) => a + s.x, 0) / seats.length;
      const z = seats.reduce((a, s) => a + s.z, 0) / seats.length;
      this.cameraController.camera.position.set(x + 2.2, 2.4, z + 2.2);
      this.cameraController.controls.target.set(x, 1.1, z);
      this.cameraController.controls.update();
      return;
    }
    const tables = this.state.tables.filter((t) => this.state.highlightedTableIds.includes(t.id));
    if (tables.length && this.state.room) {
      const x = tables.reduce((a, t) => a + t.centerX, 0) / tables.length;
      const z = tables.reduce((a, t) => a + t.centerZ, 0) / tables.length;
      this.cameraController.camera.position.set(x + 2.4, 2.6, z + 2.4);
      this.cameraController.controls.target.set(x, 0.8, z);
      this.cameraController.controls.update();
      return;
    }
    if (this.state.selection.kind === 'equipment' && this.state.selection.id) {
      this.focusSelection();
    }
  }

  private syncViewerMode(): void {
    const vm = this.state.viewerMode;
    const sig = JSON.stringify(vm);
    if (sig === this.lastViewerSignature) return;
    this.lastViewerSignature = sig;

    if (!vm.active || !vm.seatId) {
      this.cameraController.controls.enabled = true;
      if (this.state.room) this.cameraController.frameRoom(this.state.room.width, this.state.room.depth, this.state.room.height);
      return;
    }

    const seat = this.state.seats.find((s) => s.id === vm.seatId);
    if (!seat) return;
    const display = this.activeDisplay();
    const pose = computeViewerPose(seat, display, DEFAULT_EYE_HEIGHT_M);
    this.cameraController.goToViewerPosition(
      pose.position.x,
      pose.position.z,
      pose.position.y,
      new THREE.Vector3(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z)
    );
    this.cameraController.controls.enabled = false;
  }

  private onClick(e: MouseEvent): void {
    if (this.state.viewerMode.active || this.dragging) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.cameraController.camera);

    const seatHits = this.raycaster.intersectObjects(this.seatingGroup.children, true);
    for (const hit of seatHits) {
      const obj = hit.object as THREE.InstancedMesh;
      if (obj.userData?.pickable === 'seat' && hit.instanceId != null) {
        const seatId = obj.userData.seatIds?.[hit.instanceId];
        if (seatId) {
          this.state.select('seat', seatId);
          return;
        }
      }
    }

    const equipHits = this.raycaster.intersectObjects(this.equipmentGroup.children, true);
    for (const hit of equipHits) {
      const instanceId = hit.object.userData?.instanceId;
      if (instanceId) {
        this.state.select('equipment', instanceId, e.shiftKey);
        return;
      }
    }

    this.state.select('none', null);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.cameraController.update();
    this.renderer.render(this.scene, this.cameraController.camera);
  };
}
