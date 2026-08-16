/**
 * SightlineEngine.ts
 * Checks whether a viewer's line of sight to the display is
 * physically obstructed by other seats/columns/furniture (not just
 * "is the angle reasonable" — an actual geometric ray test).
 */

import type { CheckStatus, EngineeringResult } from './ViewingDistanceEngine';
import type { DisplayPlacement, SeatDisplayAnalysis } from './ViewingDistanceEngine';

export interface Obstacle {
  id: string;
  x: number;
  z: number;
  topHeightM: number; // height of the top of the obstacle above floor
  radius: number;     // approximate bounding radius, meters
}

export interface SightlineViewer {
  seatId: string;
  x: number;
  z: number;
  eyeHeightM: number;
}

export interface SightlineTarget {
  x: number;
  z: number;
  y: number; // display center height
}

export interface SightlineHit {
  obstacleId: string;
  x: number;
  y: number;
  z: number;
  t: number;
}

/**
 * Simple ray-vs-cylinder occlusion test in the vertical plane
 * containing the viewer->display line. An obstacle blocks the
 * sightline if, at the obstacle's horizontal position along that
 * line, the line-of-sight height is below the obstacle's top height
 * AND the obstacle's XZ position is within `radius` of the ray.
 */
export function evaluateSightline(
  viewer: SightlineViewer,
  target: SightlineTarget,
  obstacles: Obstacle[]
): EngineeringResult<'clear' | 'blocked'> {
  return evaluateSightlineDetailed(viewer, target, obstacles).result;
}

export function evaluateSightlineDetailed(
  viewer: SightlineViewer,
  target: SightlineTarget,
  obstacles: Obstacle[]
): { result: EngineeringResult<'clear' | 'blocked'>; hit: SightlineHit | null } {
  const dx = target.x - viewer.x;
  const dz = target.z - viewer.z;
  const totalDist = Math.hypot(dx, dz) || 1e-6;

  let blocking: Obstacle | null = null;
  let hitT = 0;

  for (const obs of obstacles) {
    const ox = obs.x - viewer.x;
    const oz = obs.z - viewer.z;
    const t = (ox * dx + oz * dz) / (totalDist * totalDist);
    if (t <= 0.02 || t >= 0.98) continue;

    const projX = viewer.x + t * dx;
    const projZ = viewer.z + t * dz;
    const perpDist = Math.hypot(obs.x - projX, obs.z - projZ);
    if (perpDist > obs.radius) continue;

    const losHeight = viewer.eyeHeightM + t * (target.y - viewer.eyeHeightM);
    if (losHeight < obs.topHeightM) {
      blocking = obs;
      hitT = t;
      break;
    }
  }

  const status: CheckStatus = blocking ? 'fail' : 'pass';
  const result: EngineeringResult<'clear' | 'blocked'> = {
    status,
    value: blocking ? 'blocked' : 'clear',
    unit: '',
    method: blocking
      ? `Line-of-sight ray intersects obstacle "${blocking.id}" below its top height along the viewer->display ray.`
      : 'Line-of-sight ray from viewer eye point to display center does not intersect any registered obstacle.',
    provenance: 'calculated'
  };
  const hit = blocking
    ? {
        obstacleId: blocking.id,
        x: viewer.x + hitT * dx,
        z: viewer.z + hitT * dz,
        y: viewer.eyeHeightM + hitT * (target.y - viewer.eyeHeightM),
        t: hitT
      }
    : null;
  return { result, hit };
}

/**
 * Fold a geometric sightline result into a viewing analysis. Blocked
 * sightlines force overall FAIL. Does not invent additional metrics.
 */
export function applyObstruction(
  analysis: SeatDisplayAnalysis,
  display: DisplayPlacement,
  viewer: SightlineViewer,
  obstacles: Obstacle[]
): SeatDisplayAnalysis {
  const sightline = evaluateSightline(viewer, {
    x: display.position.x,
    z: display.position.z,
    y: display.position.y
  }, obstacles);
  const overall: CheckStatus =
    analysis.visibility.status === 'fail' || sightline.status === 'fail' ? 'fail' : analysis.overall;
  return { ...analysis, sightline, overall };
}
