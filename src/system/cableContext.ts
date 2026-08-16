import type { EquipmentCatalog } from '../catalog/EquipmentCatalog';
import { resolveInstancePorts } from './PortResolver';
import type { CableRouteContext } from './CableRouter';
import type { RoomModel } from '../room/RoomModel';
import type { Seat, TableSpec } from '../room/SeatingGenerator';
import type { EquipmentInstance } from '../catalog/EquipmentCatalog';
import type { AVRack } from '../av/AVRack';

export function cableRouteContext(
  state: {
    room: RoomModel | null;
    equipment: EquipmentInstance[];
    tables: TableSpec[];
    seats: Seat[];
    racks: AVRack[];
  },
  catalog: EquipmentCatalog
): CableRouteContext {
  return {
    room: state.room,
    equipment: state.equipment,
    tables: state.tables,
    seats: state.seats,
    racks: state.racks,
    portOf: (instanceId, portId) => {
      const inst = state.equipment.find((e) => e.instanceId === instanceId);
      if (!inst) return undefined;
      return resolveInstancePorts(inst.instanceId, inst.productId, catalog).find((p) => p.id === portId);
    }
  };
}
