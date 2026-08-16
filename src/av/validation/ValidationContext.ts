/**
 * ValidationContext.ts
 * Snapshot of project data needed by validation checks. Engines receive
 * this — never a React component or Three.js scene.
 */

import type { RoomModel } from '../../room/RoomModel';
import type { Seat, TableSpec } from '../../room/SeatingGenerator';
import type { EquipmentInstance, EquipmentCatalog } from '../../catalog/EquipmentCatalog';
import type { SystemConnection, SystemRoute } from '../../system/SystemTypes';
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
  catalog: EquipmentCatalog;
  display: ActiveDisplayResult;
  seatAnalyses: SeatDisplayAnalysis[];
  obstacles: Obstacle[];
}
