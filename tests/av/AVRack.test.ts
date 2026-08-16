import { describe, it, expect } from 'vitest';
import { defaultFloorRack, defaultWallRack, usedRackUnits, rackFootprint, rackServiceAabb } from '../../src/av/AVRack';
import { placeAvRack } from '../../src/av/RackPlacement';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { generateSeating, defaultSeatingConfig } from '../../src/room/SeatingGenerator';
import { aabbInsideRoom, aabbsOverlap, chairAabb, openingExclusionAabb, tableAabb } from '../../src/room/FurnitureGeometry';
import { runDesignValidation } from '../../src/av/validation/DesignValidationEngine';
import { EquipmentCatalog, type EquipmentInstance } from '../../src/catalog/EquipmentCatalog';

function inst(partial: Partial<EquipmentInstance> & Pick<EquipmentInstance, 'instanceId'>): EquipmentInstance {
  return {
    productId: 'none',
    name: partial.name ?? partial.instanceId,
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    ...partial
  };
}

describe('AV rack model', () => {
  it('floor and wall racks expose RU capacity without inventing equipment', () => {
    expect(defaultFloorRack().ruTotal).toBe(42);
    expect(defaultWallRack().ruTotal).toBe(12);
    expect(usedRackUnits([])).toBe(0);
  });

  it('places the rack against a wall, not in the seating field', () => {
    const room = createDefaultRoom('conference');
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    const { rack, ok } = placeAvRack(room, [...tables.map(tableAabb), ...seats.map(chairAabb)]);
    expect(ok).toBe(true);
    expect(aabbInsideRoom(room, rackFootprint(rack), 0.02)).toBe(true);
    const service = rackServiceAabb(rack);
    tables.forEach((t) => expect(aabbsOverlap(service, tableAabb(t), 0.04)).toBe(false));
    room.openings.forEach((o) => {
      expect(aabbsOverlap(rackFootprint(rack), openingExclusionAabb(room, o.wall, o.offset, o.width), 0.05)).toBe(false);
    });
  });

  it('RACK-003 errors when assigned RU exceeds capacity', () => {
    const rack = defaultFloorRack();
    const report = runDesignValidation({
      room: { ...createDefaultRoom('conference'), openings: [], columns: [] },
      seats: [],
      tables: [],
      racks: [rack],
      equipment: [inst({ instanceId: 'over', name: 'Oversize', rackId: rack.id, rackUnits: 50 })],
      catalog: new EquipmentCatalog()
    });
    expect(report.findings.some((f) => f.code === 'RACK-003' && f.severity === 'error')).toBe(true);
  });

  it('RACK-003 DATA INCOMPLETE when assigned gear has no RU', () => {
    const rack = defaultFloorRack();
    const report = runDesignValidation({
      room: { ...createDefaultRoom('conference'), openings: [], columns: [] },
      seats: [],
      tables: [],
      racks: [rack],
      equipment: [inst({ instanceId: 'mystery', name: 'Unknown box', rackId: rack.id })],
      catalog: new EquipmentCatalog()
    });
    expect(report.findings.some((f) => f.code === 'RACK-003' && f.title.includes('DATA INCOMPLETE'))).toBe(true);
  });

  it('counts used vs available RU from known rackUnits only', () => {
    const rack = defaultFloorRack();
    const used = usedRackUnits([{ rackUnits: 2 }, { rackUnits: 1 }, {}]);
    expect(used).toBe(3);
    expect(rack.ruTotal - used).toBe(39);
  });
});
