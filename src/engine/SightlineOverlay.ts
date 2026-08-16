import * as THREE from 'three';
import type { CheckStatus } from '../av/ViewingDistanceEngine';
import { STATUS_RGB } from '../av/HeatmapEngine';
import type { SightlineHit } from '../av/SightlineEngine';

export function addSightlineRay(
  group: THREE.Group,
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  status: CheckStatus,
  hit: SightlineHit | null
): void {
  const [r, g, b] = STATUS_RGB[status];
  const color = new THREE.Color(r / 255, g / 255, b / 255);
  const start = new THREE.Vector3(from.x, from.y, from.z);
  const end = new THREE.Vector3(to.x, to.y, to.z);
  if (hit) {
    const mid = new THREE.Vector3(hit.x, hit.y, hit.z);
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([start, mid]),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
      )
    );
    const dash = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([mid, end]),
      new THREE.LineDashedMaterial({ color: 0x6f747c, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.55 })
    );
    dash.computeLineDistances();
    group.add(dash);
    const mark = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xd6483f })
    );
    mark.position.copy(mid);
    group.add(mark);
  } else {
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([start, end]),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 })
      )
    );
  }
}
