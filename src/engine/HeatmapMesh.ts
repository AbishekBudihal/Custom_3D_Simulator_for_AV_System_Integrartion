/**
 * HeatmapMesh.ts
 * Shared 3D heatmap construction. Status colors come from HeatmapEngine;
 * this module only places a texture or fallback tiles on the floor.
 */

import * as THREE from 'three';
import { STATUS_RGB } from '../av/HeatmapEngine';
import type { HeatmapImage } from '../av/HeatmapEngine';
import type { CheckStatus } from '../av/ViewingDistanceEngine';

export interface HeatmapGridLike {
  cols: number;
  rows: number;
  cells: Array<{ x: number; z: number; overall: CheckStatus }>;
}

export function addFloorHeatmap(
  group: THREE.Group,
  room: { width: number; depth: number },
  grid: HeatmapGridLike,
  image: HeatmapImage
): THREE.Mesh | null {
  if (image.dataUrl) {
    const tex = new THREE.TextureLoader().load(image.dataUrl);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.depth), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.02;
    plane.renderOrder = 1;
    group.add(plane);
    return plane;
  }

  grid.cells.forEach((cell) => {
    const [r, g, b] = STATUS_RGB[cell.overall];
    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(room.width / grid.cols, room.depth / grid.rows),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(r / 255, g / 255, b / 255),
        transparent: true,
        opacity: 0.28,
        depthWrite: false
      })
    );
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(cell.x, 0.02, cell.z);
    group.add(tile);
  });
  return null;
}
