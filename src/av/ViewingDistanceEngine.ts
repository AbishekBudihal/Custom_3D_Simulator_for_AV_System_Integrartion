/**
 * ViewingDistanceEngine.ts
 * Pure functions — no Three.js, no DOM. Every result is a
 * structured, explainable object (§32), never a bare boolean or a
 * hidden magic number.
 */

import { standardsRegistry } from './AVIXA/StandardsRegistry';
import type { ContentType } from './AVIXA/DisplayCriteria';

export interface Point2D { x: number; z: number; }

export interface DisplayPlacement {
  diagonalInches: number;
  aspectRatio: string;
  widthM: number;
  heightM: number;
  position: { x: number; y: number; z: number }; // center of screen
  wall: 'front' | 'back' | 'left' | 'right';
  /**
   * Yaw of the display in world space (radians). Matches Three.js rotationY /
   * EquipmentRenderer: local +Z is the screen face, so after yaw the face
   * normal is (sin(rotationY), cos(rotationY)). When omitted, derived from `wall`.
   */
  rotationY?: number;
}

export interface ViewerPoint {
  seatId: string;
  x: number;
  z: number;
  eyeHeightM: number; // seated eye height AFF, typically ~1.1-1.2m
}

export type CheckStatus = 'pass' | 'warning' | 'fail';

export interface EngineeringResult<T> {
  status: CheckStatus;
  value: T;
  unit: string;
  threshold?: { min?: number; max?: number };
  method: string;
  provenance: 'calculated' | 'engineering_estimate';
}

function wallNormal(wall: DisplayPlacement['wall']): { x: number; z: number } {
  // Walls face INTO the room (toward the audience), not outward.
  switch (wall) {
    case 'front': return { x: 0, z: 1 };  // wall at -Z, faces +Z into the room
    case 'back': return { x: 0, z: -1 };  // wall at +Z, faces -Z into the room
    case 'left': return { x: 1, z: 0 };   // wall at -X, faces +X into the room
    case 'right': return { x: -1, z: 0 }; // wall at +X, faces -X into the room
  }
}

/**
 * Horizontal face normal of the display (into the audience). Uses rotationY
 * when present so a side-wall or manually rotated display is not assumed
 * to face +Z / the canonical front wall.
 */
export function displayFaceNormal(display: DisplayPlacement): { x: number; z: number } {
  if (display.rotationY !== undefined) {
    return { x: Math.sin(display.rotationY), z: Math.cos(display.rotationY) };
  }
  return wallNormal(display.wall);
}

export function calculateDistance(display: DisplayPlacement, viewer: ViewerPoint): EngineeringResult<number> {
  const dx = viewer.x - display.position.x;
  const dz = viewer.z - display.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  return {
    status: 'pass',
    value: Number(dist.toFixed(2)),
    unit: 'm',
    method: 'Euclidean planar distance between viewer seat and display center.',
    provenance: 'calculated'
  };
}

/**
 * Horizontal viewing angle: the angle between the display's face
 * normal and the line-of-sight from the viewer, measured in the
 * horizontal plane. 0deg = dead-center on-axis.
 */
export function calculateHorizontalViewingAngle(display: DisplayPlacement, viewer: ViewerPoint): EngineeringResult<number> {
  const normal = displayFaceNormal(display);
  const toViewer = { x: viewer.x - display.position.x, z: viewer.z - display.position.z };
  const mag = Math.hypot(toViewer.x, toViewer.z) || 1e-6;
  const dot = (normal.x * toViewer.x + normal.z * toViewer.z) / mag;
  const angleRad = Math.acos(Math.min(1, Math.max(-1, dot)));
  const angleDeg = (angleRad * 180) / Math.PI;

  // Practical AV design guidance: <30deg is generally comfortable off-axis,
  // 30-45deg marginal (color/contrast shift on many LCD panels), >45deg poor.
  const status: CheckStatus = angleDeg <= 30 ? 'pass' : angleDeg <= 45 ? 'warning' : 'fail';

  return {
    status,
    value: Number(angleDeg.toFixed(1)),
    unit: 'deg',
    threshold: { max: 45 },
    method: 'Angle between display face normal and viewer line-of-sight, measured in the horizontal plane. Pass <=30deg, warning 30-45deg, fail >45deg (off-axis contrast/color shift threshold commonly used in AV design practice, not a cited standard).',
    provenance: 'engineering_estimate'
  };
}

export function calculateVerticalViewingAngle(display: DisplayPlacement, viewer: ViewerPoint): EngineeringResult<number> {
  const distance = calculateDistance(display, viewer).value;
  const dy = display.position.y - viewer.eyeHeightM;
  const angleDeg = (Math.atan2(dy, Math.max(distance, 0.01)) * 180) / Math.PI;
  const absAngle = Math.abs(angleDeg);
  const status: CheckStatus = absAngle <= 15 ? 'pass' : absAngle <= 30 ? 'warning' : 'fail';
  return {
    status,
    value: Number(angleDeg.toFixed(1)),
    unit: 'deg',
    threshold: { max: 30 },
    method: 'Vertical angle from viewer eye height to display center. Pass <=15deg, warning 15-30deg, fail >30deg (neck-strain / distortion heuristic, not a cited standard).',
    provenance: 'engineering_estimate'
  };
}

export function evaluateViewingDistance(
  display: DisplayPlacement,
  viewer: ViewerPoint,
  contentType: ContentType
): EngineeringResult<number> {
  const distance = calculateDistance(display, viewer).value;
  const range = standardsRegistry.active().compute(display.diagonalInches, contentType, display.aspectRatio);
  let status: CheckStatus = 'pass';
  if (distance < range.minM || distance > range.maxM) status = 'fail';
  else if (distance > range.maxM * 0.9) status = 'warning';

  return {
    status,
    value: distance,
    unit: 'm',
    threshold: { min: range.minM, max: range.maxM },
    method: `${range.methodology} (method: ${standardsRegistry.active().label})`,
    provenance: 'engineering_estimate'
  };
}

export type VisibilityValue = 'visible' | 'behind_display';

export function calculateVisibility(display: DisplayPlacement, viewer: ViewerPoint): EngineeringResult<VisibilityValue> {
  const normal = displayFaceNormal(display);
  const toViewer = { x: viewer.x - display.position.x, z: viewer.z - display.position.z };
  const mag = Math.hypot(toViewer.x, toViewer.z) || 1e-6;
  const facing = (normal.x * toViewer.x + normal.z * toViewer.z) / mag;
  const behind = facing <= 0;
  return {
    status: behind ? 'fail' : 'pass',
    value: behind ? 'behind_display' : 'visible',
    unit: '',
    method: behind
      ? 'Viewer is on or behind the display face plane (dot of face-normal · viewer vector ≤ 0). The screen is not visible from this position.'
      : 'Viewer is in front of the display face (geometric half-space test). Occupant bodies, glass, and architectural openings are not modeled here — see sightline/obstruction for registered obstacles.',
    provenance: 'calculated'
  };
}

export interface SeatDisplayAnalysis {
  seatId: string;
  distance: EngineeringResult<number>;
  horizontalAngle: EngineeringResult<number>;
  verticalAngle: EngineeringResult<number>;
  viewingDistance: EngineeringResult<number>;
  visibility: EngineeringResult<VisibilityValue>;
  /** Geometric ray vs registered obstacles. Default: not evaluated (clear). */
  sightline: EngineeringResult<'clear' | 'blocked'>;
  overall: CheckStatus;
}

export function unevaluatedSightline(): EngineeringResult<'clear' | 'blocked'> {
  return {
    status: 'pass',
    value: 'clear',
    unit: '',
    method: 'Obstruction not evaluated in this call (no obstacle list supplied).',
    provenance: 'calculated'
  };
}

export function worstStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warning')) return 'warning';
  return 'pass';
}

export function analyzeSeat(
  display: DisplayPlacement,
  viewer: ViewerPoint,
  contentType: ContentType
): SeatDisplayAnalysis {
  const distance = calculateDistance(display, viewer);
  const visibility = calculateVisibility(display, viewer);
  const horizontalAngle = calculateHorizontalViewingAngle(display, viewer);
  const verticalAngle = calculateVerticalViewingAngle(display, viewer);
  const viewingDistance = evaluateViewingDistance(display, viewer, contentType);

  const overall = visibility.status === 'fail'
    ? 'fail'
    : worstStatus([horizontalAngle.status, verticalAngle.status, viewingDistance.status]);

  return {
    seatId: viewer.seatId,
    distance,
    horizontalAngle,
    verticalAngle,
    viewingDistance,
    visibility,
    sightline: unevaluatedSightline(),
    overall
  };
}

export function analyzeAllSeats(
  display: DisplayPlacement,
  viewers: ViewerPoint[],
  contentType: ContentType
): SeatDisplayAnalysis[] {
  return viewers.map((v) => analyzeSeat(display, v, contentType));
}
