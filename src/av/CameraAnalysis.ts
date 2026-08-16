/**
 * CameraAnalysis.ts
 * Resolves catalog cameras into CameraCoverageEngine placements.
 * Missing horizontalFovDeg → DATA INCOMPLETE (no invented 90°).
 */

import type { CameraSpec, EquipmentCatalog, EquipmentInstance } from '../catalog/EquipmentCatalog';
import type { Seat, TableSpec } from '../room/SeatingGenerator';
import type { RoomModel } from '../room/RoomModel';
import { presentationRotation } from '../room/RoomGeometry';
import type { CheckStatus } from './ViewingDistanceEngine';
import { obstaclesFromProject } from './ObstacleBuilder';
import {
  CAMERA_METHOD,
  DEFAULT_EAR_HEIGHT_M,
  coverageRegionFromCamera,
  evaluateRoomCameraCoverage,
  evaluateSeatCamera,
  type CameraCoverageRegion,
  type CameraPlacement,
  type SeatCameraResult
} from './CameraCoverageEngine';

export interface ResolvedCamera extends CameraPlacement {
  instanceId: string;
  name: string;
  productId: string;
  incomplete: boolean;
  incompleteReason?: string;
  coverageRegion?: CameraCoverageRegion;
}

export function cameraFacingRad(inst: EquipmentInstance): number {
  return inst.wall ? presentationRotation(inst.wall) : inst.rotationY;
}

export function resolveCameraFromCatalog(
  spec: CameraSpec | undefined,
  inst: EquipmentInstance
):
  | { ok: true; placement: Omit<CameraPlacement, 'id' | 'x' | 'y' | 'z'> }
  | { ok: false; reason: string } {
  if (!spec) {
    return { ok: false, reason: 'DATA INCOMPLETE — product has no camera specification block.' };
  }
  const hfov = spec.horizontalFovDeg;
  if (hfov == null || !(hfov > 0) || hfov > 360) {
    return {
      ok: false,
      reason: 'DATA INCOMPLETE — catalog has no usable horizontalFovDeg. A default FOV is not invented.'
    };
  }
  const vfov = spec.verticalFovDeg;
  return {
    ok: true,
    placement: {
      facingRad: cameraFacingRad(inst),
      horizontalFovDeg: hfov,
      verticalFovDeg: vfov != null && vfov > 0 ? vfov : undefined
    }
  };
}

export function resolveProjectCameras(
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog
): ResolvedCamera[] {
  const out: ResolvedCamera[] = [];
  equipment.forEach((inst) => {
    const product = catalog.get(inst.productId);
    if (!product || product.category !== 'camera') return;
    const resolved = resolveCameraFromCatalog(product.camera, inst);
    if (!resolved.ok) {
      out.push({
        id: inst.instanceId,
        instanceId: inst.instanceId,
        name: inst.name,
        productId: inst.productId,
        x: inst.position.x,
        y: inst.position.y,
        z: inst.position.z,
        facingRad: cameraFacingRad(inst),
        horizontalFovDeg: 0,
        incomplete: true,
        incompleteReason: resolved.reason
      });
      return;
    }
    const placement: CameraPlacement = {
      id: inst.instanceId,
      x: inst.position.x,
      y: inst.position.y,
      z: inst.position.z,
      ...resolved.placement
    };
    out.push({
      ...placement,
      instanceId: inst.instanceId,
      name: inst.name,
      productId: inst.productId,
      incomplete: false,
      coverageRegion: coverageRegionFromCamera(placement)
    });
  });
  return out;
}

export function usableCameraPlacements(resolved: ResolvedCamera[]): CameraPlacement[] {
  return resolved
    .filter((c) => !c.incomplete)
    .map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      z: c.z,
      facingRad: c.facingRad,
      horizontalFovDeg: c.horizontalFovDeg,
      verticalFovDeg: c.verticalFovDeg
    }));
}

export function seatsAsCameraTargets(seats: Seat[]) {
  return seats.map((s) => ({
    seatId: s.id,
    x: s.x,
    z: s.z,
    earHeightM: DEFAULT_EAR_HEIGHT_M
  }));
}

export function summarizeCameraCoverage(
  seats: Seat[],
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog,
  room: RoomModel | null,
  tables: TableSpec[]
) {
  const cameras = usableCameraPlacements(resolveProjectCameras(equipment, catalog));
  const obstacles = obstaclesFromProject(room, tables);
  return evaluateRoomCameraCoverage(seatsAsCameraTargets(seats), cameras, obstacles);
}

export function computeSeatCameraStatuses(
  seats: Seat[],
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog,
  room: RoomModel | null,
  tables: TableSpec[]
): Map<string, CheckStatus> {
  const map = new Map<string, CheckStatus>();
  summarizeCameraCoverage(seats, equipment, catalog, room, tables).seatResults.forEach((r) => {
    map.set(r.seatId, r.overall);
  });
  return map;
}

export function analyzeSeatCamera(
  seat: Seat,
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog,
  room: RoomModel | null,
  tables: TableSpec[]
): SeatCameraResult {
  const cameras = usableCameraPlacements(resolveProjectCameras(equipment, catalog));
  return evaluateSeatCamera(
    { seatId: seat.id, x: seat.x, z: seat.z, earHeightM: DEFAULT_EAR_HEIGHT_M },
    cameras,
    obstaclesFromProject(room, tables)
  );
}

export { CAMERA_METHOD };
