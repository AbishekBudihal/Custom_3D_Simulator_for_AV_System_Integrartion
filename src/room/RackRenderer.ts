import * as THREE from 'three';
import type { AVRack } from '../av/AVRack';

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.45, metalness: 0.25 });
const railMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.35, metalness: 0.4 });
const selectedMat = new THREE.MeshBasicMaterial({ color: 0x2f8cff, wireframe: true });

export function renderRacks(racks: AVRack[], selectedId: string | null): THREE.Group {
  const root = new THREE.Group();
  racks.forEach((rack) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(rack.width, rack.height, rack.depth), bodyMat);
    body.castShadow = true;
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.03, rack.height * 0.92, 0.02), railMat);
    railL.position.set(-rack.width / 2 + 0.04, 0, rack.depth / 2 - 0.03);
    const railR = railL.clone();
    railR.position.x = rack.width / 2 - 0.04;
    g.add(body, railL, railR);
    g.position.set(rack.x, rack.y, rack.z);
    g.rotation.y = rack.rotationY;
    g.userData.rackId = rack.id;
    g.userData.pickable = 'rack';
    g.traverse((o) => {
      o.userData.rackId = rack.id;
      o.userData.pickable = 'rack';
    });
    if (selectedId === rack.id) {
      const outline = new THREE.Mesh(new THREE.BoxGeometry(rack.width + 0.02, rack.height + 0.02, rack.depth + 0.02), selectedMat);
      g.add(outline);
    }
    root.add(g);
  });
  return root;
}
