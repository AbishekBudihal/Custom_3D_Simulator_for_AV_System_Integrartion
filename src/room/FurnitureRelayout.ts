/**
 * Relayout chairs from an existing TableSpec. Does not infer a table from seats.
 */

import { seatsAroundConferenceTable } from './ConferenceLayout';
import type { TableSpec } from './SeatingGenerator';

export { seatsAroundConferenceTable };

export function rotateTableSpec90(table: TableSpec): TableSpec {
  return { ...table, sizeX: table.sizeZ, sizeZ: table.sizeX };
}

export function conferenceClearanceM(room: { width: number; depth: number }, table: TableSpec): number {
  const box = {
    minX: table.centerX - table.sizeX / 2,
    maxX: table.centerX + table.sizeX / 2,
    minZ: table.centerZ - table.sizeZ / 2,
    maxZ: table.centerZ + table.sizeZ / 2
  };
  return Math.min(
    box.minX - (-room.width / 2),
    room.width / 2 - box.maxX,
    box.minZ - (-room.depth / 2),
    room.depth / 2 - box.maxZ
  );
}
