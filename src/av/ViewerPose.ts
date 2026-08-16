/**
 * ViewerPose.ts
 * Pure eye-point / look-at for Viewer Mode. Does not touch Three.js or
 * project state — SceneManager only applies the result to the camera.
 */

import type { Seat } from '../room/SeatingGenerator';
import type { DisplayPlacement } from './ViewingDistanceEngine';
import { seatForward } from '../room/RoomGeometry';

export interface ViewerPose {
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
}

export function computeViewerPose(
  seat: Seat,
  display: DisplayPlacement | null,
  eyeHeightM: number
): ViewerPose {
  const position = { x: seat.x, y: eyeHeightM, z: seat.z };
  if (display) {
    return {
      position,
      lookAt: { x: display.position.x, y: display.position.y, z: display.position.z }
    };
  }
  const forward = seatForward(seat.facing);
  return {
    position,
    lookAt: { x: seat.x + forward.x * 3, y: 1.2, z: seat.z + forward.z * 3 }
  };
}
