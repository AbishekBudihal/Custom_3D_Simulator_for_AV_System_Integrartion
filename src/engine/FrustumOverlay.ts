/**
 * 3D camera frustum from catalog FOV and actual pose.
 * Vertical FOV is drawn only when present in catalog.
 */

import * as THREE from 'three';
import type { CameraPlacement } from '../av/CameraCoverageEngine';

export function addCameraFrustumOverlay(group: THREE.Group, cam: CameraPlacement, selected: boolean, farM = 8): void {
  const color = selected ? 0x2f8cff : 0x6b5cff;
  const origin = new THREE.Vector3(cam.x, cam.y, cam.z);
  const halfH = ((cam.horizontalFovDeg / 2) * Math.PI) / 180;
  const hasV = cam.verticalFovDeg != null && cam.verticalFovDeg > 0;
  const halfV = hasV ? ((cam.verticalFovDeg! / 2) * Math.PI) / 180 : 0;
  const fx = Math.sin(cam.facingRad);
  const fz = Math.cos(cam.facingRad);

  const corner = (yaw: number, pitch: number): THREE.Vector3 => {
    const dist = farM / Math.max(0.2, Math.cos(yaw));
    const horiz = dist * Math.cos(pitch);
    const y = cam.y + dist * Math.sin(pitch);
    return new THREE.Vector3(
      cam.x + Math.sin(cam.facingRad + yaw) * horiz,
      y,
      cam.z + Math.cos(cam.facingRad + yaw) * horiz
    );
  };

  const look = origin.clone().add(new THREE.Vector3(fx, 0, fz).multiplyScalar(0.35));
  group.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([origin, look]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
    )
  );

  if (hasV) {
    const fl = corner(-halfH, halfV);
    const fr = corner(halfH, halfV);
    const br = corner(halfH, -halfV);
    const bl = corner(-halfH, -halfV);
    const pts = [fl, fr, br, bl, fl];
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 })
      )
    );
    [fl, fr, br, bl].forEach((p) => {
      group.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([origin, p]),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 })
        )
      );
    });
    const positions: number[] = [];
    const faces = [
      [origin, fl, fr],
      [origin, fr, br],
      [origin, br, bl],
      [origin, bl, fl]
    ];
    faces.forEach((tri) => {
      tri.forEach((p) => positions.push(p.x, p.y, p.z));
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    group.add(
      new THREE.Mesh(
        geom,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.08,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      )
    );
  } else {
    const left = new THREE.Vector3(cam.x + Math.sin(cam.facingRad - halfH) * farM, cam.y, cam.z + Math.cos(cam.facingRad - halfH) * farM);
    const right = new THREE.Vector3(cam.x + Math.sin(cam.facingRad + halfH) * farM, cam.y, cam.z + Math.cos(cam.facingRad + halfH) * farM);
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([origin, left, right, origin]),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 })
      )
    );
  }
}
