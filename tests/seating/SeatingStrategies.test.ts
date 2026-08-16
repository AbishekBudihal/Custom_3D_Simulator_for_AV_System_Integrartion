import { describe, it, expect } from 'vitest';
import { generateSeating, defaultSeatingConfig } from '../../src/room/SeatingGenerator';
import { createDefaultRoom, type RoomModel } from '../../src/room/RoomModel';
import { resolveSeatingLayout } from '../../src/room/SeatingStrategy';
import { aabbsOverlap, aabbInsideRoom, chairAabb, openingExclusionAabb, tableAabb } from '../../src/room/FurnitureGeometry';
import { generateDesign } from '../../src/autodesign/DesignPipeline';
import { defaultQuickRequirements } from '../../src/autodesign/DesignRequirements';
import { loadDefaultCatalog } from '../../src/catalog/loadCatalog';
import { rackServiceAabb } from '../../src/av/AVRack';

function bareRoom(overrides: Partial<RoomModel> = {}): RoomModel {
  const r = createDefaultRoom('conference');
  return { ...r, openings: [], columns: [], ...overrides };
}

function furnitureInside(room: RoomModel, seats: ReturnType<typeof generateSeating>['seats'], tables: ReturnType<typeof generateSeating>['tables']): void {
  tables.forEach((t) => expect(aabbInsideRoom(room, tableAabb(t), 0.02)).toBe(true));
  seats.forEach((s) => expect(aabbInsideRoom(room, chairAabb(s), 0.02)).toBe(true));
}

function noTableOverlap(tables: ReturnType<typeof generateSeating>['tables']): void {
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      expect(aabbsOverlap(tableAabb(tables[i]), tableAabb(tables[j]), 0.01)).toBe(false);
    }
  }
}

describe('Seating strategies A–H', () => {
  it('Case A: 4 seats use one conference table with chairs around it', () => {
    const room = bareRoom({ width: 6, depth: 5 });
    const { seats, tables, valid } = generateSeating(room, defaultSeatingConfig(4, 'conference'));
    expect(valid).toBe(true);
    expect(tables.length).toBe(1);
    expect(seats.length).toBe(4);
    expect(new Set(seats.map((s) => s.tableId)).size).toBe(1);
    expect(tables[0].sizeX).toBeLessThan(room.width * 0.45);
    furnitureInside(room, seats, tables);
  });

  it('Case B: 8-seat conference is occupancy-sized, not a wall-width slab', () => {
    const room = bareRoom({ width: 8, depth: 7 });
    const { seats, tables, valid } = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    expect(valid).toBe(true);
    expect(tables.length).toBe(1);
    expect(seats.length).toBe(8);
    expect(tables[0].sizeX).toBeLessThan(2);
    furnitureInside(room, seats, tables);
  });

  it('Case C: 12 seats remain one conference table', () => {
    const room = bareRoom({ width: 8, depth: 10 });
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(12, 'conference'));
    expect(tables.length).toBe(1);
    expect(seats.length).toBe(12);
    seats.forEach((s) => expect(s.tableId).toBe(tables[0].id));
    furnitureInside(room, seats, tables);
  });

  it('Case D: 16 seats in a large room use independent tables', () => {
    const room = bareRoom({ width: 12, depth: 10 });
    expect(resolveSeatingLayout(room, 16, 'auto', 'video_conference')).toBe('flexible');
    const { seats, tables, valid } = generateSeating(room, defaultSeatingConfig(16, 'flexible'));
    expect(valid).toBe(true);
    expect(tables.length).toBeGreaterThan(1);
    expect(new Set(seats.map((s) => s.tableId)).size).toBe(tables.length);
    tables.forEach((t) => expect(t.sizeX).toBeLessThanOrEqual(1.6));
    noTableOverlap(tables);
    furnitureInside(room, seats, tables);
  });

  it('Case E: 24 seats in a large room use independent movable tables', () => {
    const room = bareRoom({ width: 14, depth: 12 });
    const { seats, tables, valid } = generateSeating(room, defaultSeatingConfig(24, 'training'));
    expect(valid).toBe(true);
    expect(tables.length).toBeGreaterThan(4);
    expect(seats.length).toBe(24);
    noTableOverlap(tables);
    furnitureInside(room, seats, tables);
  });

  it('Case F: divisible 24+ seats get zone ids on tables', () => {
    const room = bareRoom({ width: 16, depth: 10, divisible: true });
    const { seats, tables, valid } = generateSeating(room, defaultSeatingConfig(24, 'flexible'));
    expect(valid).toBe(true);
    expect(seats.length).toBe(24);
    expect(tables.some((t) => t.zoneId === 'A')).toBe(true);
    expect(tables.some((t) => t.zoneId === 'B')).toBe(true);
    furnitureInside(room, seats, tables);
  });

  it('Case G: door exclusion is not occupied by furniture', () => {
    const room = createDefaultRoom('conference');
    const door = room.openings.find((o) => o.kind === 'door')!;
    const excl = openingExclusionAabb(room, door.wall, door.offset, door.width);
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    tables.forEach((t) => expect(aabbsOverlap(tableAabb(t), excl, 0.02)).toBe(false));
    seats.forEach((s) => expect(aabbsOverlap(chairAabb(s), excl, 0.02)).toBe(false));
  });

  it('Case H: windows are treated as wall exclusions', () => {
    const room = bareRoom({
      width: 8,
      depth: 7,
      openings: [{ id: 'w1', wall: 'left', offset: 2, width: 1.8, height: 1.4, sillHeight: 0.9, kind: 'window' }]
    });
    const win = room.openings[0];
    const excl = openingExclusionAabb(room, win.wall, win.offset, win.width);
    const { seats, tables, valid } = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    expect(valid).toBe(true);
    tables.forEach((t) => expect(aabbsOverlap(tableAabb(t), excl, 0.02)).toBe(false));
    seats.forEach((s) => expect(aabbsOverlap(chairAabb(s), excl, 0.02)).toBe(false));
  });
});

describe('Auto Design rack + furniture (I–J)', () => {
  it('Case I/J: Auto Design places a rack with furniture and a display', () => {
    const catalog = loadDefaultCatalog();
    const p = generateDesign(
      { room: null, seats: [], tables: [], equipment: [], connections: [], routes: [] },
      {
        ...defaultQuickRequirements(),
        completeMissingOnly: false,
        constraints: { ...defaultQuickRequirements().constraints, keepExistingSeating: false, keepExistingEquipment: false },
        useCase: 'video_conference',
        seating: { count: 8, layout: 'auto' },
        room: { width: 8, length: 10, height: 3 }
      },
      catalog
    );
    expect(p.status).toBe('ok');
    const opt = p.options[0]!;
    expect(opt.racks?.length).toBe(1);
    expect(opt.tables.length).toBe(1);
    expect(opt.equipment.some((e) => catalog.get(e.productId)?.category === 'display')).toBe(true);
    const rack = opt.racks![0];
    const service = rackServiceAabb(rack);
    opt.tables.forEach((t) => expect(aabbsOverlap(service, tableAabb(t), 0.04)).toBe(false));
    expect(aabbInsideRoom(opt.room, { minX: rack.x - rack.width / 2, maxX: rack.x + rack.width / 2, minZ: rack.z - rack.depth / 2, maxZ: rack.z + rack.depth / 2 }, 0.02)).toBe(true);
  });
});
