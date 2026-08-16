/**
 * Occupant / eye point. Seats are furniture; analysis uses this point.
 * Same seated eye height as DesignAnalysis / camera / speaker ear height.
 */

import type { Seat } from '../../room/SeatingGenerator';
import { DEFAULT_EYE_HEIGHT_M } from '../DesignAnalysis';
import type { ViewerPoint } from '../ViewingDistanceEngine';

export function occupantFromSeat(seat: Seat, eyeHeightM = DEFAULT_EYE_HEIGHT_M): ViewerPoint {
  return { seatId: seat.id, x: seat.x, z: seat.z, eyeHeightM };
}

export function occupantEyeWorld(seat: Seat, eyeHeightM = DEFAULT_EYE_HEIGHT_M): { x: number; y: number; z: number } {
  return { x: seat.x, y: eyeHeightM, z: seat.z };
}
