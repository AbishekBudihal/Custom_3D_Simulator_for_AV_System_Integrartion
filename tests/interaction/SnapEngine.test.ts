import { describe, it, expect } from 'vitest';
import { createDefaultRoom, type RoomModel } from '../../src/room/RoomModel';
import { snapWallMounted, displayOverlapsOpening, snapCeilingMounted } from '../../src/interaction/SnapEngine';
import type { EquipmentProduct } from '../../src/catalog/EquipmentCatalog';
import { worldToWallOffset } from '../../src/room/RoomGeometry';

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

function bareRoom(overrides: Partial<RoomModel> = {}): RoomModel {
  return { ...createDefaultRoom('conference'), openings: [], columns: [], ...overrides };
}

describe('SnapEngine — wall snap avoids doors', () => {
  it('snapping near a door on the front wall keeps the display out of the exclusion zone', () => {
    const room = bareRoom({
      width: 10,
      depth: 7,
      openings: [{ wall: 'front', offset: 3.6, width: 1.0, height: 2.1, sillHeight: 0, kind: 'door' }]
    });

    // Drop point deliberately on the door span
    const snapped = snapWallMounted(room, display86, 0, -3.5, 1.8);
    expect(snapped.snapKind).toBe('wall');
    expect(snapped.wall).toBe('front');

    const offset = worldToWallOffset(room, snapped.wall!, snapped.position.x, snapped.position.z);
    expect(displayOverlapsOpening(room, snapped.wall!, offset, display86.physical.width)).toBe(false);
  });

  it('ceiling snap sets Y to room height minus inset', () => {
    const room = bareRoom({ height: 3.2 });
    const snapped = snapCeilingMounted(room, 1, 2);
    expect(snapped.position.y).toBeCloseTo(3.05, 2);
    expect(snapped.snapKind).toBe('ceiling');
  });
});
