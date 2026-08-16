/**
 * SpeakerCoverageEngine.ts
 * Geometric / free-field ENGINEERING ESTIMATE — not room-acoustic
 * prediction, reverberation, STI, or phase interference.
 *
 * Model:
 *   1. A listener at (x, earHeight, z) is inside a speaker’s coverage
 *      only if within the catalog dispersion (see withinDispersion).
 *   2. Level from one in-coverage source:
 *        L(d) = maxSplAt1m − 20·log10(max(d, 0.3 m))
 *      (inverse-square / free-field distance law).
 *   3. Multiple in-coverage sources are combined as an INCOHERENT
 *      intensity sum: 10·log10(Σ 10^(Li/10)). Linear dB addition and
 *      phase interference are NOT used.
 *
 * Dispersion:
 *   - Catalog dispersionDeg only, ceiling: conical angle from vertical.
 *   - Catalog dispersionDeg only, wall/pendant: horizontal angle vs facing.
 *   - If horizontalDispersionDeg AND verticalDispersionDeg are present,
 *     both are applied (no invented substitute for a missing axis).
 * Missing maxSplAt1m or dispersion → caller must treat as DATA INCOMPLETE
 * (this engine does not invent 100 dB or 90°).
 */

import type { CheckStatus, EngineeringResult } from './ViewingDistanceEngine';
import { sampleFloorGrid } from './simulation/FloorGrid';

export type ListeningZone = 'main_seating' | 'presenter' | 'rear_seating' | 'overflow' | 'audience';

export interface SpeakerPlacement {
  id: string;
  x: number;
  y: number;
  z: number;
  mount: 'ceiling' | 'wall' | 'pendant' | 'integrated';
  facingRad: number;
  /** Nominal conical / single-axis width (degrees), when that is all the catalog has. */
  dispersionDeg?: number;
  horizontalDispersionDeg?: number;
  verticalDispersionDeg?: number;
  maxSplAt1m: number;
}

export interface CoverageSeat {
  seatId: string;
  x: number;
  z: number;
  earHeightM: number;
  zone?: ListeningZone;
}

export const SPL_TARGET_MIN = 70;
export const SPL_TARGET_MAX = 100;
export const DEFAULT_EAR_HEIGHT_M = 1.1;

export const AUDIO_METHOD =
  'Free-field inverse-square SPL from catalog maxSplAt1m, clipped to catalog dispersion. Incoherent intensity sum of in-dispersion sources. Not room acoustics, reverberation, STI, or phase interference.';

export function splAtDistance(maxSplAt1m: number, distanceM: number): number {
  const d = Math.max(distanceM, 0.3);
  return maxSplAt1m - 20 * Math.log10(d);
}

export function combineSplIncoherent(levelsDb: number[]): number | null {
  if (levelsDb.length === 0) return null;
  const sum = levelsDb.reduce((acc, L) => acc + 10 ** (L / 10), 0);
  return 10 * Math.log10(sum);
}

function wrappedAbsDeltaDeg(aRad: number, bRad: number): number {
  let d = ((aRad - bRad) * 180) / Math.PI;
  d = ((d + 180) % 360 + 360) % 360 - 180;
  return Math.abs(d);
}

export function dispersionHalfAngles(speaker: SpeakerPlacement): {
  horizontalDeg: number | null;
  verticalDeg: number | null;
  conicalDeg: number | null;
  model: 'conical' | 'horizontal' | 'horizontal_vertical';
} | null {
  const h = speaker.horizontalDispersionDeg;
  const v = speaker.verticalDispersionDeg;
  if (h != null && h > 0 && v != null && v > 0) {
    return { horizontalDeg: h / 2, verticalDeg: v / 2, conicalDeg: null, model: 'horizontal_vertical' };
  }
  const d = speaker.dispersionDeg;
  if (d == null || !(d > 0)) return null;
  if (speaker.mount === 'ceiling') {
    return { horizontalDeg: null, verticalDeg: null, conicalDeg: d / 2, model: 'conical' };
  }
  return { horizontalDeg: d / 2, verticalDeg: null, conicalDeg: null, model: 'horizontal' };
}

export function withinDispersion(speaker: SpeakerPlacement, seat: CoverageSeat): boolean {
  const halves = dispersionHalfAngles(speaker);
  if (!halves) return false;
  const dx = seat.x - speaker.x;
  const dz = seat.z - speaker.z;
  const dy = seat.earHeightM - speaker.y;
  const horizDist = Math.hypot(dx, dz);

  if (halves.model === 'conical' && halves.conicalDeg != null) {
    const angleFromVertical = (Math.atan2(horizDist, Math.abs(dy)) * 180) / Math.PI;
    return angleFromVertical <= halves.conicalDeg;
  }

  const toSeatAngle = Math.atan2(dx, dz);
  const horizDelta = wrappedAbsDeltaDeg(toSeatAngle, speaker.facingRad);
  if (halves.horizontalDeg == null || horizDelta > halves.horizontalDeg) return false;

  if (halves.model === 'horizontal_vertical' && halves.verticalDeg != null) {
    const elevDeg = (Math.atan2(dy, Math.max(horizDist, 0.001)) * 180) / Math.PI;
    return Math.abs(elevDeg) <= halves.verticalDeg;
  }
  return true;
}

export function classifySpl(spl: number | null): CheckStatus {
  if (spl == null) return 'fail';
  if (spl < SPL_TARGET_MIN) return 'fail';
  if (spl > SPL_TARGET_MAX) return 'warning';
  return 'pass';
}

export interface SeatAudioResult {
  seatId: string;
  splAtSeat: number | null;
  contributingSpeakerId: string | null;
  contributingSpeakerIds: string[];
  distanceM: number | null;
  horizontalAngleDeg: number | null;
  inDispersion: boolean;
  status: CheckStatus;
  zone: ListeningZone;
}

export function evaluateSeatAudio(seat: CoverageSeat, speakers: SpeakerPlacement[]): EngineeringResult<SeatAudioResult> {
  const contributions: { id: string; spl: number; dist: number; ang: number }[] = [];

  speakers.forEach((sp) => {
    if (!withinDispersion(sp, seat)) return;
    const dist = Math.hypot(seat.x - sp.x, seat.z - sp.z, seat.earHeightM - sp.y);
    const spl = splAtDistance(sp.maxSplAt1m, dist);
    const ang = wrappedAbsDeltaDeg(Math.atan2(seat.x - sp.x, seat.z - sp.z), sp.facingRad);
    contributions.push({ id: sp.id, spl, dist, ang });
  });

  const combined = combineSplIncoherent(contributions.map((c) => c.spl));
  const nearest = contributions.slice().sort((a, b) => a.dist - b.dist)[0];
  const status = classifySpl(combined);
  const result: SeatAudioResult = {
    seatId: seat.seatId,
    splAtSeat: combined != null ? Number(combined.toFixed(1)) : null,
    contributingSpeakerId: nearest?.id ?? null,
    contributingSpeakerIds: contributions.map((c) => c.id),
    distanceM: nearest ? Number(nearest.dist.toFixed(2)) : null,
    horizontalAngleDeg: nearest ? Number(nearest.ang.toFixed(1)) : null,
    inDispersion: contributions.length > 0,
    status,
    zone: seat.zone ?? 'main_seating'
  };

  return {
    status: result.status,
    value: result,
    unit: 'dB SPL',
    threshold: { min: SPL_TARGET_MIN, max: SPL_TARGET_MAX },
    method: AUDIO_METHOD,
    provenance: 'engineering_estimate'
  };
}

export function evaluateRoomAudioCoverage(seats: CoverageSeat[], speakers: SpeakerPlacement[]) {
  const results = seats.map((s) => evaluateSeatAudio(s, speakers).value);
  const covered = results.filter((r) => r.status === 'pass').length;
  return {
    totalSeats: seats.length,
    coveredSeats: covered,
    coveragePct: seats.length ? Math.round((100 * covered) / seats.length) : 0,
    seatResults: results,
    methodology: 'Geometric Coverage Simulation (not a validated acoustic model). ' + AUDIO_METHOD
  };
}

export interface SpeakerCoverageCell {
  col: number;
  row: number;
  x: number;
  z: number;
  overall: CheckStatus;
  splAtSeat: number | null;
  score?: number;
}

export interface SpeakerCoverageGrid {
  cols: number;
  rows: number;
  spacingM: number;
  cells: SpeakerCoverageCell[];
  passCount: number;
  warningCount: number;
  failCount: number;
  method: string;
}

export function sampleSpeakerCoverage(
  room: { width: number; depth: number },
  speakers: SpeakerPlacement[],
  quality: 'standard' | 'high' = 'standard',
  earHeightM = DEFAULT_EAR_HEIGHT_M
): SpeakerCoverageGrid {
  const sampled = sampleFloorGrid(room, quality, (point) => {
    const r = evaluateSeatAudio(
      { seatId: `cell-${point.col}-${point.row}`, x: point.x, z: point.z, earHeightM, zone: 'main_seating' },
      speakers
    ).value;
    return {
      col: point.col,
      row: point.row,
      x: point.x,
      z: point.z,
      overall: r.status,
      splAtSeat: r.splAtSeat,
      score:
        r.splAtSeat == null
          ? 0
          : Math.min(1, Math.max(0, (r.splAtSeat - 55) / 40))
    };
  });
  return {
    ...sampled,
    method: `Uniform floor grid at ear height ${earHeightM} m; each cell uses evaluateSeatAudio. ${AUDIO_METHOD}`
  };
}

export interface SpeakerCoverageRegion {
  kind: 'disc' | 'sector';
  x: number;
  z: number;
  outline: Array<{ x: number; z: number }>;
  model: string;
}

/** Floor footprint of the SAME dispersion test used by withinDispersion (ear-height listener). */
export function coverageRegionFromSpeaker(
  speaker: SpeakerPlacement,
  earHeightM = DEFAULT_EAR_HEIGHT_M
): SpeakerCoverageRegion | null {
  const halves = dispersionHalfAngles(speaker);
  if (!halves) return null;
  const segs = 64;

  if (halves.model === 'conical' && halves.conicalDeg != null) {
    const drop = Math.abs(speaker.y - earHeightM);
    const radius = drop * Math.tan((halves.conicalDeg * Math.PI) / 180);
    const outline: Array<{ x: number; z: number }> = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      outline.push({ x: speaker.x + Math.sin(a) * radius, z: speaker.z + Math.cos(a) * radius });
    }
    return {
      kind: 'disc',
      x: speaker.x,
      z: speaker.z,
      outline,
      model: 'Ceiling conical dispersion projected to ear-height plane (same angle test as the evaluator).'
    };
  }

  const half = ((halves.horizontalDeg ?? 0) * Math.PI) / 180;
  const radius = 12;
  const outline: Array<{ x: number; z: number }> = [{ x: speaker.x, z: speaker.z }];
  for (let i = 0; i <= segs; i++) {
    const a = speaker.facingRad - half + (i / segs) * 2 * half;
    outline.push({
      x: speaker.x + Math.sin(a) * radius,
      z: speaker.z + Math.cos(a) * radius
    });
  }
  outline.push({ x: speaker.x, z: speaker.z });
  return {
    kind: 'sector',
    x: speaker.x,
    z: speaker.z,
    outline,
    model: 'Wall/pendant horizontal dispersion sector (same azimuth test as the evaluator). Distance is not clipped; SPL is evaluated separately.'
  };
}
