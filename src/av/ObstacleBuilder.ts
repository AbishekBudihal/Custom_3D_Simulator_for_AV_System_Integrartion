/**
 * ObstacleBuilder.ts
 * Turns project furniture/architecture into SightlineEngine Obstacle[]
 * so obstruction tests use the same TableSpec[] / columns as the rest
 * of the app — never inferred chair-row geometry.
 *
 * Honesty: occupant bodies, door swings, and glazing are not modeled.
 * Tables use a conservative cylinder (bounding radius + top height of
 * the rendered table surface). Columns use room height.
 */

import type { RoomModel } from '../room/RoomModel';
import type { TableSpec } from '../room/SeatingGenerator';
import type { Obstacle } from './SightlineEngine';
import type { AVRack } from './AVRack';
import { rackFootprint } from './AVRack';

/** Matches SeatingRenderer table top (~0.73m) plus a small allowance. */
export const TABLE_TOP_HEIGHT_M = 0.75;

export function obstaclesFromProject(room: RoomModel | null, tables: TableSpec[], racks: AVRack[] = []): Obstacle[] {
  const obstacles: Obstacle[] = [];
  tables.forEach((t) => {
    obstacles.push({
      id: `table:${t.id}`,
      x: t.centerX,
      z: t.centerZ,
      topHeightM: t.height ?? TABLE_TOP_HEIGHT_M,
      radius: Math.max(0.15, Math.hypot(t.sizeX, t.sizeZ) / 2)
    });
  });
  racks.forEach((r) => {
    const foot = rackFootprint(r);
    obstacles.push({
      id: `rack:${r.id}`,
      x: r.x,
      z: r.z,
      topHeightM: r.kind === 'wall' ? r.y + r.height / 2 : r.height,
      radius: Math.max(0.15, Math.hypot(foot.maxX - foot.minX, foot.maxZ - foot.minZ) / 2)
    });
  });
  if (room) {
    room.columns.forEach((c, i) => {
      obstacles.push({
        id: `column:${i}`,
        x: c.x,
        z: c.z,
        topHeightM: room.height,
        radius: Math.max(0.1, Math.hypot(c.width, c.depth) / 2)
      });
    });
  }
  return obstacles;
}
