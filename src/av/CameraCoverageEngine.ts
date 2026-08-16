/**
 * CameraCoverageEngine.ts
 * Geometric frustum ENGINEERING ESTIMATE — not photometric, NVR,
 * pixel-density, lux, PTZ, auto-framing, distortion, or lens modeling.
 *
 * Model:
 *   1. Facing is project rotationY (wall cameras: presentationRotation).
 *      Look +Z when facingRad = 0 (same azimuth convention as wall speakers).
 *   2. Horizontal FOV: |azimuth(camera→point) − facing| ≤ horizontalFovDeg/2.
 *   3. Vertical FOV, only if catalog verticalFovDeg > 0:
 *      |elevation from camera to ear-height point| ≤ verticalFovDeg/2.
 *      Missing VFOV → horizontal-only model (not invented 16:9).
 *   4. Occlusion: SightlineEngine.evaluateSightline (tables + columns).
 *      In-FOV + blocked is distinct from outside FOV.
 *   5. Multiple cameras: UNION — visible if any camera is in-FOV and clear.
 *
 * Missing horizontalFovDeg → caller DATA INCOMPLETE (no silent 90°).
 */

import type { CheckStatus } from './ViewingDistanceEngine';
import { evaluateSightline, type Obstacle } from './SightlineEngine';
import { sampleFloorGrid } from './simulation/FloorGrid';

export const DEFAULT_EAR_HEIGHT_M = 1.1;
export const CAMERA_METHOD =
  'Geometric frustum estimate: catalog horizontal FOV vs camera facing, optional catalog vertical FOV, SightlineEngine occlusion (tables/columns). Union of cameras. Not photometric, NVR, pixels-on-target, lux, PTZ, auto-framing, or distortion.';

export interface CameraPlacement {
  id: string;
  x: number;
  y: number;
  z: number;
  facingRad: number;
  horizontalFovDeg: number;
  verticalFovDeg?: number;
}

export interface CameraCoverageSeat {
  seatId: string;
  x: number;
  z: number;
  earHeightM: number;
}

function wrappedAbsDeltaDeg(aRad: number, bRad: number): number {
  let d = ((aRad - bRad) * 180) / Math.PI;
  d = ((d + 180) % 360 + 360) % 360 - 180;
  return Math.abs(d);
}

export function azimuthToPoint(cam: CameraPlacement, x: number, z: number): number {
  return Math.atan2(x - cam.x, z - cam.z);
}

export function withinHorizontalFov(cam: CameraPlacement, x: number, z: number): boolean {
  const half = cam.horizontalFovDeg / 2;
  if (!(half > 0)) return false;
  return wrappedAbsDeltaDeg(azimuthToPoint(cam, x, z), cam.facingRad) <= half;
}

export function withinVerticalFov(
  cam: CameraPlacement,
  x: number,
  z: number,
  earHeightM: number
): boolean {
  if (cam.verticalFovDeg == null || !(cam.verticalFovDeg > 0)) return true;
  const horiz = Math.max(Math.hypot(x - cam.x, z - cam.z), 0.001);
  const elevDeg = (Math.atan2(earHeightM - cam.y, horiz) * 180) / Math.PI;
  return Math.abs(elevDeg) <= cam.verticalFovDeg / 2;
}

export function withinFov(cam: CameraPlacement, seat: CameraCoverageSeat): boolean {
  return withinHorizontalFov(cam, seat.x, seat.z) && withinVerticalFov(cam, seat.x, seat.z, seat.earHeightM);
}

export function sightlineFromCamera(
  cam: CameraPlacement,
  seat: CameraCoverageSeat,
  obstacles: Obstacle[]
): 'clear' | 'blocked' {
  return evaluateSightline(
    { seatId: seat.seatId, x: cam.x, z: cam.z, eyeHeightM: cam.y },
    { x: seat.x, z: seat.z, y: seat.earHeightM },
    obstacles
  ).value;
}

export interface SeatCameraResult {
  seatId: string;
  inFov: boolean;
  sightline: 'clear' | 'blocked' | 'n/a';
  visible: boolean;
  coveringCameraIds: string[];
  blockingCameraIds: string[];
  nearestCameraId: string | null;
  distanceM: number | null;
  horizontalAngleDeg: number | null;
  /** pass = visible; warning = in FOV but blocked; fail = outside FOV */
  overall: CheckStatus;
  status: CheckStatus;
}

export function evaluateSeatCamera(
  seat: CameraCoverageSeat,
  cameras: CameraPlacement[],
  obstacles: Obstacle[]
): SeatCameraResult {
  const covering: string[] = [];
  const blocking: string[] = [];
  let nearest: { id: string; dist: number; ang: number } | null = null;

  for (const cam of cameras) {
    const dist = Math.hypot(seat.x - cam.x, seat.z - cam.z, seat.earHeightM - cam.y);
    const ang = wrappedAbsDeltaDeg(azimuthToPoint(cam, seat.x, seat.z), cam.facingRad);
    if (!nearest || dist < nearest.dist) nearest = { id: cam.id, dist, ang };
    if (!withinFov(cam, seat)) continue;
    if (sightlineFromCamera(cam, seat, obstacles) === 'clear') covering.push(cam.id);
    else blocking.push(cam.id);
  }

  const visible = covering.length > 0;
  const inFov = covering.length > 0 || blocking.length > 0;
  const overall: CheckStatus = visible ? 'pass' : inFov ? 'warning' : 'fail';
  return {
    seatId: seat.seatId,
    inFov,
    sightline: visible ? 'clear' : inFov ? 'blocked' : 'n/a',
    visible,
    coveringCameraIds: covering,
    blockingCameraIds: blocking,
    nearestCameraId: covering[0] ?? blocking[0] ?? nearest?.id ?? null,
    distanceM: nearest ? Number(nearest.dist.toFixed(2)) : null,
    horizontalAngleDeg: nearest ? Number(nearest.ang.toFixed(1)) : null,
    overall,
    status: visible ? 'pass' : 'fail'
  };
}

export function evaluateRoomCameraCoverage(
  seats: CameraCoverageSeat[],
  cameras: CameraPlacement[],
  obstacles: Obstacle[]
) {
  const seatResults = seats.map((s) => evaluateSeatCamera(s, cameras, obstacles));
  const visibleSeats = seatResults.filter((r) => r.visible).length;
  return {
    totalSeats: seats.length,
    visibleSeats,
    outsideFovSeats: seatResults.filter((r) => !r.inFov).length,
    blockedSeats: seatResults.filter((r) => r.inFov && !r.visible).length,
    coveragePct: seats.length ? Math.round((100 * visibleSeats) / seats.length) : 0,
    seatResults,
    methodology: CAMERA_METHOD
  };
}

export interface CameraCoverageCell {
  col: number;
  row: number;
  x: number;
  z: number;
  overall: CheckStatus;
  inFov: boolean;
  visible: boolean;
  score?: number;
}

export interface CameraCoverageGrid {
  cols: number;
  rows: number;
  spacingM: number;
  cells: CameraCoverageCell[];
  passCount: number;
  warningCount: number;
  failCount: number;
  method: string;
}

export function sampleCameraCoverage(
  room: { width: number; depth: number },
  cameras: CameraPlacement[],
  obstacles: Obstacle[],
  quality: 'standard' | 'high' = 'standard',
  earHeightM = DEFAULT_EAR_HEIGHT_M
): CameraCoverageGrid {
  const sampled = sampleFloorGrid(room, quality, (point) => {
    const r = evaluateSeatCamera(
      { seatId: `cell-${point.col}-${point.row}`, x: point.x, z: point.z, earHeightM },
      cameras,
      obstacles
    );
    return {
      col: point.col,
      row: point.row,
      x: point.x,
      z: point.z,
      overall: r.overall,
      inFov: r.inFov,
      visible: r.visible,
      score: r.visible ? 1 : r.inFov ? 0.45 : 0
    };
  });
  return {
    ...sampled,
    method: `Uniform floor grid at ear height ${earHeightM} m; each cell uses evaluateSeatCamera. ${CAMERA_METHOD}`
  };
}

export interface CameraCoverageRegion {
  kind: 'sector';
  x: number;
  z: number;
  outline: Array<{ x: number; z: number }>;
  model: string;
}

/** Floor outline of the SAME horizontal (and optional vertical near-clip) test as withinFov. */
export function coverageRegionFromCamera(
  cam: CameraPlacement,
  earHeightM = DEFAULT_EAR_HEIGHT_M,
  maxRadiusM = 16
): CameraCoverageRegion {
  const half = ((cam.horizontalFovDeg / 2) * Math.PI) / 180;
  const segs = 48;
  let minR = 0.05;
  if (cam.verticalFovDeg != null && cam.verticalFovDeg > 0) {
    const drop = Math.abs(cam.y - earHeightM);
    const vf = (cam.verticalFovDeg / 2) * (Math.PI / 180);
    if (vf > 0 && Math.tan(vf) > 0) minR = Math.max(minR, drop / Math.tan(vf));
  }
  const outline: Array<{ x: number; z: number }> = [];
  const pushArc = (radius: number, reverse: boolean) => {
    for (let i = 0; i <= segs; i++) {
      const t = reverse ? 1 - i / segs : i / segs;
      const a = cam.facingRad - half + t * 2 * half;
      outline.push({
        x: cam.x + Math.sin(a) * radius,
        z: cam.z + Math.cos(a) * radius
      });
    }
  };
  outline.push({ x: cam.x, z: cam.z });
  pushArc(maxRadiusM, false);
  outline.push({ x: cam.x, z: cam.z });
  if (minR > 0.06) {
    outline.push({ x: cam.x, z: cam.z });
    pushArc(minR, true);
    outline.push({ x: cam.x, z: cam.z });
  }
  return {
    kind: 'sector',
    x: cam.x,
    z: cam.z,
    outline,
    model:
      cam.verticalFovDeg != null && cam.verticalFovDeg > 0
        ? 'Horizontal FOV sector with vertical-FOV near clip on the ear-height plane (same tests as the evaluator).'
        : 'Horizontal FOV sector (same azimuth test as the evaluator). Vertical FOV not in catalog — not invented.'
  };
}
