import { describe, it, expect } from 'vitest';
import { createDefaultRoom, generateOpeningId, type RoomModel } from '../../src/room/RoomModel';
import { defaultSeatingConfig, generateSeating } from '../../src/room/SeatingGenerator';
import { suggestDisplayPlacement } from '../../src/av/PlacementSuggestionEngine';
import { selectPresentationWall, scorePlacementWalls } from '../../src/av/placement/PlacementCandidateEngine';
import { generateDesign, selectedOption } from '../../src/autodesign/DesignPipeline';
import { defaultQuickRequirements, type DesignRequirements } from '../../src/autodesign/DesignRequirements';
import { loadDefaultCatalog } from '../../src/catalog/loadCatalog';
import { splitDivisibleZones } from '../../src/room/RoomZones';
import { placeAvRack } from '../../src/av/RackPlacement';
import { tableAabb, chairAabb } from '../../src/room/FurnitureGeometry';
import type { EquipmentProduct } from '../../src/catalog/EquipmentCatalog';

const catalog = loadDefaultCatalog();

const display86: EquipmentProduct = {
  id: 'disp-86',
  manufacturer: 'Acme',
  model: 'AC-86',
  category: 'display',
  type: 'display',
  physical: { width: 1.9, height: 1.1, depth: 0.06 },
  display: { diagonalInches: 86, resolution: '4K', aspectRatio: '16:9', brightnessNits: 500 },
  mounting: { wall: true, floor: false, ceiling: false },
  provenance: 'estimated'
};

function roomWithDoor(
  width: number,
  depth: number,
  doorWall: RoomModel['openings'][0]['wall'],
  extras: Partial<RoomModel> = {}
): RoomModel {
  const len = doorWall === 'front' || doorWall === 'back' ? width : depth;
  return {
    ...createDefaultRoom('conference'),
    width,
    depth,
    openings: [
      { id: generateOpeningId('door'), wall: doorWall, offset: Math.max(0.4, len * 0.15), width: 1.0, height: 2.1, sillHeight: 0, kind: 'door' }
    ],
    presentationWall: undefined,
    ...extras
  };
}

function req(count: number, layout: DesignRequirements['seating']['layout'], w: number, d: number): DesignRequirements {
  const base = defaultQuickRequirements();
  return {
    ...base,
    completeMissingOnly: false,
    seating: { count, layout },
    room: { width: w, length: d, height: 3 },
    constraints: { ...base.constraints, keepExistingSeating: false, keepExistingEquipment: false }
  };
}

function autoDisplayWall(count: number, layout: DesignRequirements['seating']['layout'], w: number, d: number, doorWall: RoomModel['openings'][0]['wall']) {
  const room = roomWithDoor(w, d, doorWall);
  const p = generateDesign(
    { room, seats: [], tables: [], equipment: [], connections: [], routes: [] },
    req(count, layout, w, d),
    catalog
  );
  const opt = selectedOption(p)!;
  const disp = opt.equipment.find((e) => catalog.get(e.productId)?.category === 'display');
  return { opt, disp, doorWall };
}

describe('PlacementCandidateEngine — presentation wall scoring', () => {
  it('A/C: 4-seat and 8-seat rooms with a door do not present on the door wall', () => {
    const a = selectPresentationWall(roomWithDoor(6, 6, 'front'));
    expect(a).not.toBe('front');
    const c = selectPresentationWall(roomWithDoor(8, 8, 'front'));
    expect(c).not.toBe('front');
  });

  it('B: 6-seat boardroom with a side door still avoids that door wall', () => {
    expect(selectPresentationWall(roomWithDoor(8, 6, 'left'))).not.toBe('left');
  });

  it('G/J: a window wall loses to a clear solid wall', () => {
    const room = roomWithDoor(10, 8, 'left', {
      openings: [
        { id: 'd1', wall: 'left', offset: 1, width: 1, height: 2.1, sillHeight: 0, kind: 'door' },
        { id: 'w1', wall: 'front', offset: 1, width: 6, height: 1.8, sillHeight: 0.9, kind: 'window' }
      ]
    });
    const wall = selectPresentationWall(room);
    expect(wall).not.toBe('front');
    expect(wall).not.toBe('left');
  });

  it('H: with doors on three walls, the remaining clear wall wins', () => {
    const room = roomWithDoor(8, 6, 'front', {
      openings: [
        { id: 'a', wall: 'front', offset: 1, width: 1, height: 2.1, sillHeight: 0, kind: 'door' },
        { id: 'b', wall: 'back', offset: 1, width: 1, height: 2.1, sillHeight: 0, kind: 'door' },
        { id: 'c', wall: 'right', offset: 1, width: 1, height: 2.1, sillHeight: 0, kind: 'door' }
      ]
    });
    expect(selectPresentationWall(room)).toBe('left');
  });

  it('I: door on a candidate presentation wall is not chosen when a better wall exists', () => {
    const ranked = scorePlacementWalls(roomWithDoor(8, 8, 'front'));
    expect(ranked[0].wall).not.toBe('front');
    expect(ranked.find((c) => c.wall === 'front')!.score).toBeLessThan(ranked[0].score);
  });
});

describe('Default catalog display placement', () => {
  it('O: catalog default is not the door wall on an 8×8 room', () => {
    const room = roomWithDoor(8, 8, 'front');
    const suggestion = suggestDisplayPlacement(room, display86);
    expect(suggestion.wall).not.toBe('front');
  });
});

describe('Auto Design placement intelligence', () => {
  it('A: 4-seat room Auto Design keeps the display off the door wall', () => {
    const { disp, doorWall } = autoDisplayWall(4, 'boardroom', 6, 6, 'front');
    expect(disp).toBeTruthy();
    expect(disp!.wall).not.toBe(doorWall);
  });

  it('B: 6-seat boardroom Auto Design keeps the display off the door wall', () => {
    const { disp, doorWall } = autoDisplayWall(6, 'boardroom', 8, 6, 'left');
    expect(disp!.wall).not.toBe(doorWall);
  });

  it('C/P: 8-seat conference Auto Design keeps the display off the door wall', () => {
    const { disp, doorWall } = autoDisplayWall(8, 'boardroom', 8, 8, 'front');
    expect(disp).toBeTruthy();
    expect(disp!.wall).not.toBe(doorWall);
  });

  it('D: 12-seat conference with a door', () => {
    const { disp, doorWall } = autoDisplayWall(12, 'conference', 10, 8, 'front');
    expect(disp!.wall).not.toBe(doorWall);
  });

  it('E/F: 16- and 24-seat training rooms keep presentation off the entry wall', () => {
    const e = autoDisplayWall(16, 'training', 12, 10, 'front');
    expect(e.disp!.wall).not.toBe('front');
    const f = autoDisplayWall(24, 'classroom', 14, 12, 'left');
    expect(f.disp!.wall).not.toBe('left');
  });

  it('N: rack is not on the presentation wall and misses door openings', () => {
    const room = roomWithDoor(10, 8, 'front');
    room.presentationWall = selectPresentationWall(room);
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    const placed = placeAvRack(room, [...tables.map(tableAabb), ...seats.map(chairAabb)]);
    expect(placed.rack.wall).not.toBe(room.presentationWall);
    expect(placed.ok).toBe(true);
  });

  it('K/L/M: divisible zones still pick a wall that is not the primary door wall', () => {
    const room = roomWithDoor(14, 8, 'front');
    room.divisible = true;
    room.zones = splitDivisibleZones(room);
    const combined = selectPresentationWall(room);
    expect(combined).not.toBe('front');
    const a = selectPresentationWall(room, { zone: room.zones[0] });
    const b = selectPresentationWall(room, { zone: room.zones[1] });
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });
});
