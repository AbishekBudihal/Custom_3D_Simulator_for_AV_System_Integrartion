/**
 * Independent movable tables (classroom / training / flexible).
 * Each table is its own TableSpec; each chair is its own Seat with tableId.
 */

import type { RoomModel } from './RoomModel';
import { furnitureTemplate } from './FurnitureCatalog';
import { aabbsOverlap, type Aabb } from './FurnitureGeometry';
import { makeFurnitureTable, roomExclusionAabbs, MIN_WALK_M } from './ConferenceLayout';
import type { Seat, SeatingConfig, SeatingGenerationResult } from './SeatingGenerator';
import { roomZonesFor, type RoomZone } from './RoomZones';

function podFootprint(seatsAtTable: number): { tableW: number; tableD: number; cellW: number; cellD: number } {
  const desk = furnitureTemplate('generic-training-desk');
  const tableD = desk.typicalWidth;
  const tableW = seatsAtTable === 1 ? 0.7 : 1.2;
  return {
    tableW,
    tableD,
    cellW: tableW + 0.55,
    cellD: tableD + desk.chairFromEdge + 0.45 + MIN_WALK_M * 0.35
  };
}

export function generateIndependentTables(
  room: RoomModel,
  cfg: SeatingConfig,
  opts: { seatsPerTable: 1 | 2; zone?: RoomZone } = { seatsPerTable: 2 }
): SeatingGenerationResult {
  const seats: Seat[] = [];
  const tables: ReturnType<typeof makeFurnitureTable>[] = [];
  const warnings: string[] = [];
  const desk = furnitureTemplate('generic-training-desk');
  const exclusions = roomExclusionAabbs(room, cfg.exclusions ?? []);
  const zone = opts.zone;
  const minX = zone ? zone.minX : -room.width / 2;
  const maxX = zone ? zone.maxX : room.width / 2;
  const minZ = zone ? zone.minZ : -room.depth / 2;
  const maxZ = zone ? zone.maxZ : room.depth / 2;
  const usableW = maxX - minX - 2 * cfg.sideClearance * (zone ? 0.5 : 1);
  const usableD = maxZ - minZ - cfg.frontClearance - cfg.rearClearance * (zone ? 0.6 : 1);
  const fp = podFootprint(opts.seatsPerTable);
  const cols = Math.max(1, Math.floor(usableW / fp.cellW));
  const rows = Math.max(1, Math.floor(usableD / fp.cellD));
  const originX = (minX + maxX) / 2 - ((cols - 1) * fp.cellW) / 2;
  const originZ = minZ + cfg.frontClearance + fp.cellD * 0.55;

  let placed = 0;
  let tableIndex = 0;
  for (let r = 0; r < rows && placed < cfg.capacity; r++) {
    for (let c = 0; c < cols && placed < cfg.capacity; c++) {
      const remaining = cfg.capacity - placed;
      const nHere = Math.min(opts.seatsPerTable, remaining) as 1 | 2;
      const local = podFootprint(nHere);
      const cx = originX + c * fp.cellW;
      const cz = originZ + r * fp.cellD;
      const chairZ = cz + local.tableD / 2 + desk.chairFromEdge;
      const table = makeFurnitureTable(
        `${zone?.id ?? 'room'}-t${tableIndex + 1}`,
        'generic-training-desk',
        cx,
        cz,
        local.tableW,
        local.tableD,
        { shape: 'rect', hasCableWell: false, zoneId: zone?.id }
      );
      const chairXs =
        nHere === 1 ? [cx] : [cx - local.tableW * 0.22, cx + local.tableW * 0.22];
      const trialSeats: Seat[] = chairXs.map((x, i) => ({
        id: `Z${zone?.id ?? 'A'}-T${tableIndex + 1}-S${i + 1}`,
        row: r + 1,
        indexInRow: placed + i + 1,
        x: Number(x.toFixed(3)),
        z: Number(chairZ.toFixed(3)),
        facing: 0,
        hasTable: true,
        tableId: table.id,
        zoneId: zone?.id
      }));
      const box: Aabb = {
        minX: Math.min(cx - local.tableW / 2, ...trialSeats.map((s) => s.x - 0.22)),
        maxX: Math.max(cx + local.tableW / 2, ...trialSeats.map((s) => s.x + 0.22)),
        minZ: cz - local.tableD / 2,
        maxZ: Math.max(...trialSeats.map((s) => s.z + 0.45))
      };
      if (box.minX < minX + 0.2 || box.maxX > maxX - 0.2 || box.minZ < minZ + 0.2 || box.maxZ > maxZ - 0.2) {
        continue;
      }
      if (exclusions.some((e) => aabbsOverlap(box, e, 0.04))) continue;
      tables.push(table);
      seats.push(...trialSeats);
      placed += nHere;
      tableIndex += 1;
    }
  }

  if (placed < cfg.capacity) {
    warnings.push(
      `${cfg.capacity} seats cannot be accommodated with the selected room dimensions and required circulation. Placed ${placed}.`
    );
  }

  return {
    seats,
    tables,
    warnings,
    valid: placed === cfg.capacity,
    layoutReason: `${cfg.layout}: ${tables.length} independent table(s), each with 1–2 chairs. Tables are generator-owned entities, not inferred from chair rows.`
  };
}

export function generateFlexibleLayout(room: RoomModel, cfg: SeatingConfig): SeatingGenerationResult {
  const zones = room.divisible ? roomZonesFor(room) : [];
  if (zones.length > 1) {
    const per = Math.ceil(cfg.capacity / zones.length);
    const seats: Seat[] = [];
    const tables: SeatingGenerationResult['tables'] = [];
    const warnings: string[] = [];
    let valid = true;
    zones.forEach((zone) => {
      const part = generateIndependentTables(room, { ...cfg, capacity: per }, { seatsPerTable: 2, zone });
      seats.push(...part.seats);
      tables.push(...part.tables);
      warnings.push(...part.warnings.map((w) => `${zone.name}: ${w}`));
      if (!part.valid) valid = false;
    });
    const extra = seats.length - cfg.capacity;
    const trimmedSeats = extra > 0 ? seats.slice(0, cfg.capacity) : seats;
    const usedIds = new Set(trimmedSeats.map((s) => s.tableId));
    const trimmedTables = tables.filter((t) => usedIds.has(t.id));
    return {
      seats: trimmedSeats,
      tables: trimmedTables,
      warnings,
      valid: trimmedSeats.length === cfg.capacity && valid,
      layoutReason: `Flexible / divisible: independent tables in ${zones.length} room zones (${trimmedTables.length} tables).`
    };
  }
  return generateIndependentTables(room, cfg, { seatsPerTable: 2 });
}
