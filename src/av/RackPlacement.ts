/**
 * Places an AV rack against a suitable wall with service clearance.
 */

import type { RoomModel } from '../room/RoomModel';
import { getPresentationWall, type WallKey } from '../room/RoomGeometry';
import { aabbsOverlap, openingExclusionAabb, type Aabb } from '../room/FurnitureGeometry';
import { defaultFloorRack, rackFootprint, rackServiceAabb, type AVRack } from './AVRack';

const OPPOSITE: Record<WallKey, WallKey> = { front: 'back', back: 'front', left: 'right', right: 'left' };

function wallPose(room: RoomModel, wall: WallKey, along: number, inset: number): { x: number; z: number; rotationY: number } {
  const hw = room.width / 2;
  const hd = room.depth / 2;
  if (wall === 'back') return { x: along, z: hd - inset, rotationY: 0 };
  if (wall === 'front') return { x: along, z: -hd + inset, rotationY: Math.PI };
  if (wall === 'left') return { x: -hw + inset, z: along, rotationY: Math.PI / 2 };
  return { x: hw - inset, z: along, rotationY: -Math.PI / 2 };
}

export function placeAvRack(
  room: RoomModel,
  furniture: Aabb[],
  preferred: 'floor' | 'wall' = 'floor'
): { rack: AVRack; ok: boolean; note: string } {
  const rackBase =
    preferred === 'wall'
      ? { ...defaultFloorRack(), kind: 'wall' as const, ruTotal: 12, depth: 0.45, height: 0.65, y: 1.2, frontClearance: 0.9, rearClearance: 0.05 }
      : { ...defaultFloorRack(), rearClearance: 0.1 };
  const present = getPresentationWall(room);
  const walls: WallKey[] = [OPPOSITE[present], present === 'front' || present === 'back' ? 'left' : 'back', present === 'front' || present === 'back' ? 'right' : 'front'];
  const openings = room.openings.map((o) => openingExclusionAabb(room, o.wall, o.offset, o.width));
  const alongChoices = (wall: WallKey) => {
    const span = wall === 'front' || wall === 'back' ? room.width : room.depth;
    const insetAlong = span / 2 - 0.85;
    return [-insetAlong, insetAlong, insetAlong * 0.5, -insetAlong * 0.5, 0];
  };

  for (const wall of walls) {
    const inset = rackBase.depth / 2 + rackBase.rearClearance + 0.03;
    for (const along of alongChoices(wall)) {
      const pose = wallPose(room, wall, along, inset);
      const cand: AVRack = { ...rackBase, ...pose, wall, y: rackBase.kind === 'wall' ? 1.2 : rackBase.height / 2 };
      const foot = rackFootprint(cand);
      const service = rackServiceAabb(cand);
      const inside =
        service.minX >= -room.width / 2 + 0.02 &&
        service.maxX <= room.width / 2 - 0.02 &&
        service.minZ >= -room.depth / 2 + 0.02 &&
        service.maxZ <= room.depth / 2 - 0.02;
      const hitOpen = openings.some((o) => aabbsOverlap(foot, o, 0.05));
      const hitFurn = furniture.some((f) => aabbsOverlap(service, f, 0.05));
      if (inside && !hitOpen && !hitFurn) {
        return {
          rack: cand,
          ok: true,
          note: `Floor/wall rack on the ${wall} wall, outside seating circulation, with ${cand.frontClearance} m front and ${cand.rearClearance} m rear service clearance.`
        };
      }
    }
  }

  const fallbackPose = wallPose(room, OPPOSITE[present], room.width / 2 - 1.0, rackBase.depth / 2 + 0.1);
  return {
    rack: { ...rackBase, ...fallbackPose, wall: OPPOSITE[present], y: rackBase.height / 2 },
    ok: false,
    note: 'Rack placed with a clearance warning — service envelope conflicts with furniture, openings, or room bounds.'
  };
}
