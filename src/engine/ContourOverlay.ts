import * as THREE from 'three';
import type { ContourPolyline } from '../av/simulation/SpatialField';

export function addContourOverlay(group: THREE.Group, contours: ContourPolyline[], y = 0.035): void {
  contours.forEach((c) => {
    for (let i = 0; i + 1 < c.points.length; i += 2) {
      const a = c.points[i];
      const b = c.points[i + 1];
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, y, a.z),
        new THREE.Vector3(b.x, y, b.z)
      ]);
      group.add(
        new THREE.Line(
          geom,
          new THREE.LineBasicMaterial({
            color: c.iso >= 0.75 ? 0x2fae5a : c.iso >= 0.45 ? 0xe0a934 : 0xd6483f,
            transparent: true,
            opacity: 0.7,
            depthWrite: false
          })
        )
      );
    }
  });
}
