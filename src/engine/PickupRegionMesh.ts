/**
 * PickupRegionMesh.ts
 * Draws a PickupRegion produced by MicrophoneCoverageEngine.
 * Disc vs sector is data on the region — not a second coverage model.
 */

import * as THREE from 'three';
export interface RegionOverlay {
  kind: 'disc' | 'sector';
  x: number;
  z: number;
  outline: Array<{ x: number; z: number }>;
}

export function addPickupRegionOverlay(
  group: THREE.Group,
  region: RegionOverlay,
  selected: boolean,
  tint = 0x5aa7d4
): void {
  if (region.outline.length < 3) return;
  const color = selected ? 0x2f8cff : tint;
  const y = 0.03;
  const pts = region.outline.map((p) => new THREE.Vector3(p.x, y, p.z));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
  );
  line.renderOrder = 2;
  group.add(line);

  const positions: number[] = [];
  const rim = region.kind === 'sector' ? region.outline.slice(1, -1) : region.outline;
  for (let i = 0; i < rim.length - 1; i++) {
    positions.push(region.x, y - 0.002, region.z);
    positions.push(rim[i].x, y - 0.002, rim[i].z);
    positions.push(rim[i + 1].x, y - 0.002, rim[i + 1].z);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  mesh.renderOrder = 2;
  group.add(mesh);
}
