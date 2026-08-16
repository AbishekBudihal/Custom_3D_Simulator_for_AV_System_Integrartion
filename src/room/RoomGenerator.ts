/**
 * RoomGenerator.ts
 * Converts a RoomModel (pure data) into real architectural Three.js
 * geometry: walls with door/window cutouts (via Shape + holes,
 * not a bare box), floor, ceiling, and columns. This replaces the
 * old prototype's flat colored-plane room with actual wall
 * thickness and openings.
 */

import * as THREE from 'three';
import type { RoomModel, Opening } from './RoomModel';

const MATERIALS = {
  wall: new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide }),
  floor: new THREE.MeshStandardMaterial({ color: 0xc4bbb0, roughness: 0.78, metalness: 0.04 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xf5f4f2, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xbfe3f0, transparent: true, opacity: 0.25, roughness: 0.05, transmission: 0.6 }),
  door: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.6 }),
  column: new THREE.MeshStandardMaterial({ color: 0xd8d5cf, roughness: 0.85 })
};

/** Builds one wall (a rectangular Shape with rectangular holes for its openings), extruded to wallThickness. */
function buildWall(
  lengthAlongWall: number,
  height: number,
  thickness: number,
  openings: Opening[]
): THREE.Group {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(lengthAlongWall, 0);
  shape.lineTo(lengthAlongWall, height);
  shape.lineTo(0, height);
  shape.lineTo(0, 0);

  openings.forEach((o) => {
    const hole = new THREE.Path();
    const x0 = o.offset;
    const y0 = o.sillHeight;
    hole.moveTo(x0, y0);
    hole.lineTo(x0 + o.width, y0);
    hole.lineTo(x0 + o.width, y0 + o.height);
    hole.lineTo(x0, y0 + o.height);
    hole.lineTo(x0, y0);
    shape.holes.push(hole);
  });

  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, MATERIALS.wall);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Fill openings: doors get a solid leaf, windows get glass
  openings.forEach((o) => {
    const filler = new THREE.Mesh(
      new THREE.BoxGeometry(o.width * 0.94, o.height * 0.96, thickness * 0.4),
      o.kind === 'door' ? MATERIALS.door : MATERIALS.glass
    );
    filler.position.set(o.offset + o.width / 2, o.sillHeight + o.height / 2, thickness / 2);
    group.add(filler);
  });

  return group;
}

export function generateRoomGeometry(room: RoomModel): THREE.Group {
  const root = new THREE.Group();
  root.name = 'room-architecture';
  const { width: w, depth: d, height: h, wallThickness: t } = room;
  const hw = w / 2, hd = d / 2;

  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MATERIALS.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  root.add(floor);

  // Ceiling
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MATERIALS.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = h;
  ceiling.name = 'ceiling';
  root.add(ceiling);

  // Walls — front (-z), back (+z), left (-x), right (+x)
  const wallDefs: { key: Opening['wall']; length: number; pos: THREE.Vector3; rotY: number }[] = [
    { key: 'front', length: w, pos: new THREE.Vector3(-hw, 0, -hd), rotY: 0 },
    { key: 'back', length: w, pos: new THREE.Vector3(hw, 0, hd), rotY: Math.PI },
    { key: 'left', length: d, pos: new THREE.Vector3(-hw, 0, hd), rotY: Math.PI / 2 },
    { key: 'right', length: d, pos: new THREE.Vector3(hw, 0, -hd), rotY: -Math.PI / 2 }
  ];

  wallDefs.forEach((def) => {
    const openings = room.openings.filter((o) => o.wall === def.key);
    const wall = buildWall(def.length, h, t, openings);
    wall.position.copy(def.pos);
    wall.rotation.y = def.rotY;
    wall.name = `wall-${def.key}`;
    root.add(wall);
  });

  // Columns
  room.columns.forEach((c, i) => {
    const col = new THREE.Mesh(new THREE.BoxGeometry(c.width, h, c.depth), MATERIALS.column);
    col.position.set(c.x, h / 2, c.z);
    col.name = `column-${i}`;
    col.castShadow = true;
    root.add(col);
  });

  return root;
}
