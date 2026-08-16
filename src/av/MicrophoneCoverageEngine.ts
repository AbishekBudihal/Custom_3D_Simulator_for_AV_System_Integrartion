/**
 * MicrophoneCoverageEngine.ts
 * Domain engine for microphone pickup on the seating plane.
 *
 * Supported models (only when catalog/project fields exist):
 *   pickup_disc         — hypot(x,z) ≤ pickupRadiusM
 *   directional_sector  — disc AND |azimuth − facing| ≤ beamWidthDeg/2
 *
 * Facing comes from the placed instance rotationY (project data).
 * Beam width comes from catalog beamWidthDeg. Neither is invented.
 * Not a polar-plot, beamforming, or acoustic simulation.
 */

import type { CheckStatus } from './ViewingDistanceEngine';
import { sampleFloorGrid } from './simulation/FloorGrid';

export type MicCoverageModel = 'pickup_disc' | 'directional_sector';

export interface MicPlacement {
  id: string;
  x: number;
  z: number;
  pickupRadiusM: number;
  /** Defaults to pickup_disc when omitted (C1 fixtures / disc-only catalog). */
  coverageModel?: MicCoverageModel;
  facingRad?: number;
  beamWidthDeg?: number;
}

export interface MicCoverageSeat {
  seatId: string;
  x: number;
  z: number;
}

export interface MicCoverageMetadata {
  model: MicCoverageModel;
  source: string;
  assumptions: string;
}

export interface SeatMicResult {
  seatId: string;
  covered: boolean;
  nearestMicId: string | null;
  nearestDistanceM: number | null;
  angularDeltaDeg: number | null;
  coveringModel: MicCoverageModel | null;
  status: CheckStatus;
  criterion: string;
}

export interface PickupRegion {
  kind: 'disc' | 'sector';
  x: number;
  z: number;
  radiusM: number;
  facingRad: number;
  beamWidthDeg?: number;
  model: MicCoverageModel;
  metadata: MicCoverageMetadata;
  /** Closed XZ outline used by 3D and plan overlays — same geometry as the evaluator. */
  outline: Array<{ x: number; z: number }>;
}

export function micCoverageModel(mic: MicPlacement): MicCoverageModel {
  return mic.coverageModel ?? 'pickup_disc';
}

export function metadataForMic(mic: MicPlacement): MicCoverageMetadata {
  const model = micCoverageModel(mic);
  if (model === 'directional_sector') {
    return {
      model,
      source: 'Catalog beamWidthDeg + pickupRadiusM; facing from project rotationY.',
      assumptions:
        'Horizontal sector on the seating plane. A seat is covered if distance ≤ pickupRadiusM and the absolute azimuth error vs facing is ≤ beamWidthDeg/2. Not a polar plot, frequency-dependent pattern, or steerable array.'
    };
  }
  return {
    model,
    source: 'Catalog pickupRadiusM on the seating plane.',
    assumptions:
      'Omnidirectional disc: hypot(Δx,Δz) ≤ pickupRadiusM. Used only when no catalog beamWidthDeg / directional_sector model is supplied. Engineering estimate — not beamforming.'
  };
}

export function azimuthRad(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

export function wrappedAbsDeltaDeg(aRad: number, bRad: number): number {
  let d = ((aRad - bRad) * 180) / Math.PI;
  d = ((d + 180) % 360 + 360) % 360 - 180;
  return Math.abs(d);
}

export function seatInsideMic(seat: MicCoverageSeat, mic: MicPlacement): boolean {
  const dist = Math.hypot(seat.x - mic.x, seat.z - mic.z);
  if (dist > mic.pickupRadiusM) return false;
  if (micCoverageModel(mic) !== 'directional_sector') return true;
  const width = mic.beamWidthDeg;
  if (width == null || !(width > 0)) return false;
  const facing = mic.facingRad ?? 0;
  const az = azimuthRad(mic.x, mic.z, seat.x, seat.z);
  return wrappedAbsDeltaDeg(az, facing) <= width / 2;
}

export function evaluateSeatMicCoverage(seat: MicCoverageSeat, mics: MicPlacement[]): SeatMicResult {
  let nearest: { id: string; dist: number; ang: number | null; model: MicCoverageModel } | null = null;
  let covered = false;
  let coveringModel: MicCoverageModel | null = null;

  for (const m of mics) {
    const dist = Math.hypot(seat.x - m.x, seat.z - m.z);
    const model = micCoverageModel(m);
    const ang =
      model === 'directional_sector' ? wrappedAbsDeltaDeg(azimuthRad(m.x, m.z, seat.x, seat.z), m.facingRad ?? 0) : null;
    if (!nearest || dist < nearest.dist) nearest = { id: m.id, dist, ang, model };
    if (seatInsideMic(seat, m)) {
      covered = true;
      coveringModel = model;
    }
  }

  let criterion = 'Seat inside a calculated pickup region';
  if (nearest) {
    if (nearest.model === 'directional_sector') {
      const mic = mics.find((m) => m.id === nearest!.id);
      criterion = `distance ≤ ${mic?.pickupRadiusM ?? '?'} m and |azimuth| ≤ ${(mic?.beamWidthDeg ?? 0) / 2}°`;
    } else {
      const mic = mics.find((m) => m.id === nearest!.id);
      criterion = `distance ≤ ${mic?.pickupRadiusM ?? '?'} m (pickup disc)`;
    }
  }

  return {
    seatId: seat.seatId,
    covered,
    nearestMicId: nearest ? nearest.id : null,
    nearestDistanceM: nearest ? Number(nearest.dist.toFixed(2)) : null,
    angularDeltaDeg: nearest && nearest.ang != null ? Number(nearest.ang.toFixed(1)) : null,
    coveringModel: covered ? coveringModel : nearest?.model ?? null,
    status: covered ? 'pass' : 'fail',
    criterion
  };
}

export function pickupRegionFromMic(mic: MicPlacement): PickupRegion {
  const model = micCoverageModel(mic);
  const facing = mic.facingRad ?? 0;
  const outline: Array<{ x: number; z: number }> = [];
  const segs = 64;
  if (model === 'directional_sector' && mic.beamWidthDeg != null && mic.beamWidthDeg > 0) {
    const half = ((mic.beamWidthDeg / 2) * Math.PI) / 180;
    outline.push({ x: mic.x, z: mic.z });
    for (let i = 0; i <= segs; i++) {
      const a = facing - half + (i / segs) * 2 * half;
      outline.push({
        x: mic.x + Math.sin(a) * mic.pickupRadiusM,
        z: mic.z + Math.cos(a) * mic.pickupRadiusM
      });
    }
    outline.push({ x: mic.x, z: mic.z });
    return {
      kind: 'sector',
      x: mic.x,
      z: mic.z,
      radiusM: mic.pickupRadiusM,
      facingRad: facing,
      beamWidthDeg: mic.beamWidthDeg,
      model,
      metadata: metadataForMic(mic),
      outline
    };
  }

  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    outline.push({
      x: mic.x + Math.sin(a) * mic.pickupRadiusM,
      z: mic.z + Math.cos(a) * mic.pickupRadiusM
    });
  }
  return {
    kind: 'disc',
    x: mic.x,
    z: mic.z,
    radiusM: mic.pickupRadiusM,
    facingRad: facing,
    model,
    metadata: metadataForMic(mic),
    outline
  };
}

export interface MicCoverageCell {
  col: number;
  row: number;
  x: number;
  z: number;
  overall: CheckStatus;
  nearestMicId: string | null;
  nearestDistanceM: number | null;
}

export interface MicCoverageGrid {
  cols: number;
  rows: number;
  spacingM: number;
  cells: MicCoverageCell[];
  passCount: number;
  failCount: number;
  method: string;
}

function methodForMics(mics: MicPlacement[]): string {
  const models = new Set(mics.map(micCoverageModel));
  const parts: string[] = [];
  if (models.has('pickup_disc')) {
    parts.push('pickup disc (hypot ≤ catalog pickupRadiusM)');
  }
  if (models.has('directional_sector')) {
    parts.push('directional sector (pickupRadiusM and |azimuth vs facing| ≤ beamWidthDeg/2)');
  }
  if (!parts.length) parts.push('no usable microphone model');
  return `Uniform floor grid; each cell uses the same evaluator as seats: ${parts.join('; ')}. Engineering estimate — not beamforming / polar-pattern physics.`;
}

export function sampleMicCoverage(
  room: { width: number; depth: number },
  mics: MicPlacement[],
  quality: 'standard' | 'high' = 'standard'
): MicCoverageGrid {
  const sampled = sampleFloorGrid(room, quality, (point) => {
    const result = evaluateSeatMicCoverage({ seatId: `cell-${point.col}-${point.row}`, x: point.x, z: point.z }, mics);
    return {
      col: point.col,
      row: point.row,
      x: point.x,
      z: point.z,
      overall: result.status,
      nearestMicId: result.nearestMicId,
      nearestDistanceM: result.nearestDistanceM
    };
  });

  return {
    cols: sampled.cols,
    rows: sampled.rows,
    spacingM: sampled.spacingM,
    cells: sampled.cells,
    passCount: sampled.passCount,
    failCount: sampled.failCount,
    method: methodForMics(mics)
  };
}

export function evaluateRoomMicCoverage(seats: MicCoverageSeat[], mics: MicPlacement[]) {
  const results = seats.map((s) => evaluateSeatMicCoverage(s, mics));
  const covered = results.filter((r) => r.covered).length;

  let overlapCount = 0;
  seats.forEach((s) => {
    const coveringCount = mics.filter((m) => seatInsideMic(s, m)).length;
    if (coveringCount > 1) overlapCount++;
  });

  const models = [...new Set(mics.map(micCoverageModel))];
  const meta = mics[0] ? metadataForMic(mics[0]) : null;

  return {
    totalSeats: seats.length,
    coveredSeats: covered,
    coveragePct: seats.length ? Math.round((100 * covered) / seats.length) : 0,
    overlapSeats: overlapCount,
    uncoveredSeats: results.filter((r) => !r.covered).map((r) => r.seatId),
    seatResults: results,
    modelsUsed: models,
    methodology: methodForMics(mics),
    metadata: meta
  };
}

/**
 * Suggests minimal mic placement using the disc model only (placement heuristic).
 */
export function suggestMicPlacement(
  seats: MicCoverageSeat[],
  pickupRadiusM: number,
  maxMics = 6
): MicPlacement[] {
  const remaining = new Set(seats.map((s) => s.seatId));
  const placements: MicPlacement[] = [];

  while (remaining.size > 0 && placements.length < maxMics) {
    const remainingSeats = seats.filter((s) => remaining.has(s.seatId));
    const cx = remainingSeats.reduce((a, s) => a + s.x, 0) / remainingSeats.length;
    const cz = remainingSeats.reduce((a, s) => a + s.z, 0) / remainingSeats.length;

    const mic: MicPlacement = {
      id: `MIC-${placements.length + 1}`,
      x: cx,
      z: cz,
      pickupRadiusM,
      coverageModel: 'pickup_disc'
    };
    placements.push(mic);

    remainingSeats.forEach((s) => {
      if (Math.hypot(s.x - cx, s.z - cz) <= pickupRadiusM) remaining.delete(s.seatId);
    });

    if (remainingSeats.length === remaining.size + (seats.length - remainingSeats.length)) {
      // no-op guard
    }
  }

  return placements;
}
