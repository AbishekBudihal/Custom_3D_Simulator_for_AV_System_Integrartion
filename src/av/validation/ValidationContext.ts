/**
 * ValidationContext.ts
 * Snapshot of project data needed by validation checks. Engines receive
 * this — never a React component or Three.js scene.
 */

import type { RoomModel } from '../../room/RoomModel';
import type { Seat, TableSpec } from '../../room/SeatingGenerator';
import type { EquipmentInstance, EquipmentCatalog } from '../../catalog/EquipmentCatalog';
import type { AVRack } from '../../av/AVRack';
import type { PhysicalMedium, SystemConnection, SystemRoute } from '../../system/SystemTypes';
import type { SeatDisplayAnalysis } from '../ViewingDistanceEngine';
import type { ActiveDisplayResult } from '../DesignAnalysis';
import type { Obstacle } from '../SightlineEngine';

export interface ProjectValidationContext {
  room: RoomModel | null;
  seats: Seat[];
  tables: TableSpec[];
  equipment: EquipmentInstance[];
  connections: SystemConnection[];
  routes: SystemRoute[];
  racks: AVRack[];
  catalog: EquipmentCatalog;
  display: ActiveDisplayResult;
  seatAnalyses: SeatDisplayAnalysis[];
  obstacles: Obstacle[];
  /** Empty unless the project configures a medium-specific max run. */
  cableLengthLimitsM: Partial<Record<PhysicalMedium, number>>;
}
