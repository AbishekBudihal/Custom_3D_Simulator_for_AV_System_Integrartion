import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  constructor(container: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camera.position.set(6, 5, 8);
    this.controls = new OrbitControls(this.camera, container);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(0, 1, 0);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  frameRoom(width: number, depth: number, height: number): void {
    const diag = Math.hypot(width, depth);
    this.camera.position.set(diag * 0.55, Math.max(height * 1.6, 3), diag * 0.55);
    this.controls.target.set(0, height * 0.35, 0);
    this.controls.update();
  }

  /** Moves the camera to a specific seat's eye point, looking at a target — used by Viewer Mode (§13). */
  goToViewerPosition(seatX: number, seatZ: number, eyeHeight: number, lookAt: THREE.Vector3): void {
    this.camera.position.set(seatX, eyeHeight, seatZ);
    this.controls.target.copy(lookAt);
    this.controls.update();
  }

  update(): void {
    this.controls.update();
  }
}
