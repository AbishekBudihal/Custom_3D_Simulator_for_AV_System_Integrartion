import type { RoomModel, RoomZone } from './RoomModel';

export type { RoomZone };

export function combinedZone(room: RoomModel): RoomZone {
  return {
    id: 'combined',
    name: 'Combined Room',
    minX: -room.width / 2,
    maxX: room.width / 2,
    minZ: -room.depth / 2,
    maxZ: room.depth / 2
  };
}

/** Split along the longer plan axis with a 0.4 m partition keep-out. */
export function splitDivisibleZones(room: RoomModel): RoomZone[] {
  const gap = 0.4;
  if (room.width >= room.depth) {
    return [
      {
        id: 'A',
        name: 'Room Zone A',
        minX: -room.width / 2,
        maxX: -gap / 2,
        minZ: -room.depth / 2,
        maxZ: room.depth / 2
      },
      {
        id: 'B',
        name: 'Room Zone B',
        minX: gap / 2,
        maxX: room.width / 2,
        minZ: -room.depth / 2,
        maxZ: room.depth / 2
      }
    ];
  }
  return [
    {
      id: 'A',
      name: 'Room Zone A',
      minX: -room.width / 2,
      maxX: room.width / 2,
      minZ: -room.depth / 2,
      maxZ: -gap / 2
    },
    {
      id: 'B',
      name: 'Room Zone B',
      minX: -room.width / 2,
      maxX: room.width / 2,
      minZ: gap / 2,
      maxZ: room.depth / 2
    }
  ];
}

export function roomZonesFor(room: RoomModel): RoomZone[] {
  if (room.zones && room.zones.length) return room.zones;
  if (room.divisible) return [...splitDivisibleZones(room), combinedZone(room)].slice(0, 2);
  return [combinedZone(room)];
}
