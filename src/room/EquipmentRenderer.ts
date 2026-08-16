/**
 * EquipmentRenderer.ts
 * Turns EquipmentInstance[] (pure data + catalog lookups) into
 * actual Three.js geometry. Before this module existed, equipment
 * was added to AppState and shown in the Inspector, but never
 * appeared in the 3D scene — a placement had no visual result,
 * which is exactly the "isolated tested module" problem this pass
 * is meant to fix.
 *
 * Each root object gets userData.instanceId so SceneManager's
 * raycaster can resolve clicks back to an EquipmentInstance.
 */

import * as THREE from 'three';
import type { EquipmentInstance, EquipmentCatalog } from '../catalog/EquipmentCatalog';

const displayBodyMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.35, metalness: 0.4 });
const displayScreenMat = new THREE.MeshStandardMaterial({
  color: 0x0d3a5c,
  emissive: 0x1c6fa8,
  emissiveIntensity: 0.55,
  roughness: 0.2,
  metalness: 0.1
});
const mountMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.6, metalness: 0.5 });
const speakerMat = new THREE.MeshStandardMaterial({ color: 0x232325, roughness: 0.5, metalness: 0.3 });
const micMat = new THREE.MeshStandardMaterial({ color: 0xd8d5cf, roughness: 0.4, metalness: 0.2 });
const cameraMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.3, metalness: 0.6 });
const genericMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.6 });

const selectedOutlineMat = new THREE.MeshBasicMaterial({ color: 0x2f8cff, wireframe: true });

function buildDisplay(widthM: number, heightM: number): THREE.Group {
  const g = new THREE.Group();
  const depth = 0.06;
  const body = new THREE.Mesh(new THREE.BoxGeometry(widthM, heightM, depth), displayBodyMat);
  body.castShadow = true;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(widthM * 0.94, heightM * 0.9),
    displayScreenMat
  );
  screen.position.z = depth / 2 + 0.001;
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.08), mountMat);
  mount.position.z = -depth / 2 - 0.03;
  g.add(body, screen, mount);
  return g;
}

function buildSpeaker(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 24), speakerMat);
  box.rotation.x = Math.PI / 2;
  box.castShadow = true;
  g.add(box);
  return g;
}

function buildMicrophone(): THREE.Group {
  const g = new THREE.Group();
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 20), micMat);
  puck.castShadow = true;
  g.add(puck);
  return g;
}

function buildCamera(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), cameraMat);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16), cameraMat);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.12;
  body.castShadow = true;
  g.add(body, lens);
  return g;
}

function wallYaw(wall?: 'front' | 'back' | 'left' | 'right'): number {
  switch (wall) {
    case 'front': return 0;
    case 'back': return Math.PI;
    case 'left': return Math.PI / 2;
    case 'right': return -Math.PI / 2;
    default: return 0;
  }
}

export function renderEquipment(
  instances: EquipmentInstance[],
  catalog: EquipmentCatalog,
  selectedInstanceId: string | null
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'equipment';

  instances.forEach((inst) => {
    const product = catalog.get(inst.productId);
    if (!product) return;

    let mesh: THREE.Group;
    switch (product.category) {
      case 'display':
        mesh = buildDisplay(product.physical.width, product.physical.height);
        break;
      case 'speaker':
        mesh = buildSpeaker();
        break;
      case 'microphone':
        mesh = buildMicrophone();
        break;
      case 'camera':
        mesh = buildCamera();
        break;
      default: {
        const g = new THREE.Group();
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(product.physical.width || 0.3, product.physical.height || 0.3, product.physical.depth || 0.1),
          genericMat
        );
        box.castShadow = true;
        g.add(box);
        mesh = g;
      }
    }

    mesh.position.set(inst.position.x, inst.position.y, inst.position.z);
    mesh.rotation.y = inst.wall ? wallYaw(inst.wall) : inst.rotationY;
    mesh.userData.instanceId = inst.instanceId;
    mesh.userData.pickable = 'equipment';
    // tag every child mesh too so raycaster intersections (which hit children) resolve to the instance
    mesh.traverse((obj) => {
      obj.userData.instanceId = inst.instanceId;
      obj.userData.pickable = 'equipment';
    });

    if (inst.instanceId === selectedInstanceId) {
      // Collect target meshes first, THEN add outlines — mutating an object's
      // children while `traverse` is walking that same object's child array
      // would make the freshly-added outline mesh visible to the traversal
      // too, which (since it's also a Mesh) would recursively wrap itself.
      const targets: THREE.Mesh[] = [];
      mesh.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) targets.push(obj as THREE.Mesh);
      });
      targets.forEach((obj) => {
        const outline = new THREE.Mesh(obj.geometry, selectedOutlineMat);
        outline.scale.setScalar(1.04);
        obj.add(outline);
      });
    }

    root.add(mesh);
  });

  return root;
}
