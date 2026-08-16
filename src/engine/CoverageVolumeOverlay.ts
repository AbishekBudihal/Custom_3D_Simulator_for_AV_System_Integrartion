/**
 * Geometric speaker coverage volume: cone from a ceiling speaker to the
 * listener plane, or a wall sector extruded toward the floor.
 * Not an acoustic prediction.
 */

import * as THREE from 'three';
import type { SpeakerPlacement } from '../av/SpeakerCoverageEngine';
import { coverageRegionFromSpeaker, DEFAULT_EAR_HEIGHT_M, dispersionHalfAngles } from '../av/SpeakerCoverageEngine';

export function addSpeakerCoverageVolume(group: THREE.Group, speaker: SpeakerPlacement, selected: boolean): void {
  const color = selected ? 0x2f8cff : 0xd68c32;
  const halves = dispersionHalfAngles(speaker);
  if (!halves) return;
  const origin = new THREE.Vector3(speaker.x, speaker.y, speaker.z);

  if (halves.model === 'conical' && halves.conicalDeg != null) {
    const drop = Math.abs(speaker.y - DEFAULT_EAR_HEIGHT_M);
    const radius = drop * Math.tan((halves.conicalDeg * Math.PI) / 180);
    const height = Math.max(0.2, drop);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 28, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
        wireframe: false
      })
    );
    cone.position.set(speaker.x, DEFAULT_EAR_HEIGHT_M + height / 2, speaker.z);
    cone.rotation.x = Math.PI;
    group.add(cone);
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.ConeGeometry(radius, height, 16, 1, true)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })
    );
    wire.position.copy(cone.position);
    wire.rotation.copy(cone.rotation);
    group.add(wire);
    return;
  }

  const region = coverageRegionFromSpeaker(speaker);
  if (!region) return;
  region.outline.forEach((p, i) => {
    if (i % 8 !== 0 && i !== 0 && i !== region.outline.length - 1) return;
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([origin, new THREE.Vector3(p.x, DEFAULT_EAR_HEIGHT_M, p.z)]),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.28 })
      )
    );
  });
}
