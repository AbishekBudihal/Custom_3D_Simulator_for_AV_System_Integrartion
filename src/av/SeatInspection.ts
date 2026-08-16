/**
 * Seat inspection uses existing analysis engines — not a second calculator.
 */

import type { EquipmentCatalog, EquipmentInstance } from '../catalog/EquipmentCatalog';
import type { RoomModel } from '../room/RoomModel';
import type { Seat, TableSpec } from '../room/SeatingGenerator';
import { analyzeSeatAgainstDisplay, DEFAULT_EYE_HEIGHT_M, getActiveDisplay, projectObstacles } from './DesignAnalysis';
import type { SeatDisplayAnalysis } from './ViewingDistanceEngine';
import { occupantFromSeat } from './simulation/OccupantPoint';
import { analyzeSeatCamera } from './CameraAnalysis';
import { analyzeSeatAudio } from './SpeakerAnalysis';
import { evaluateSeatMicCoverage, type SeatMicResult } from './MicrophoneCoverageEngine';
import { resolveProjectMicrophones, usableMicPlacements } from './MicAnalysis';
import type { SeatCameraResult } from './CameraCoverageEngine';
import type { SeatAudioResult } from './SpeakerCoverageEngine';

export interface SeatInspection {
  occupant: { eyeHeightM: number; x: number; z: number };
  display: SeatDisplayAnalysis | null;
  camera: SeatCameraResult | null;
  speaker: SeatAudioResult | null;
  mic: SeatMicResult | null;
}

export function inspectSeat(
  seat: Seat,
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog,
  room: RoomModel | null,
  tables: TableSpec[]
): SeatInspection {
  const occ = occupantFromSeat(seat);
  const display = getActiveDisplay(equipment, catalog);
  const displayAnalysis = display
    ? analyzeSeatAgainstDisplay(display, seat, projectObstacles(room, tables))
    : null;
  const hasCam = equipment.some((e) => catalog.get(e.productId)?.category === 'camera');
  const hasSpk = equipment.some((e) => catalog.get(e.productId)?.category === 'speaker');
  const mics = usableMicPlacements(resolveProjectMicrophones(equipment, catalog));
  return {
    occupant: { eyeHeightM: occ.eyeHeightM, x: occ.x, z: occ.z },
    display: displayAnalysis,
    camera: hasCam ? analyzeSeatCamera(seat, equipment, catalog, room, tables) : null,
    speaker: hasSpk ? analyzeSeatAudio(seat, equipment, catalog) : null,
    mic: mics.length ? evaluateSeatMicCoverage({ seatId: seat.id, x: seat.x, z: seat.z }, mics) : null
  };
}

export { DEFAULT_EYE_HEIGHT_M };
