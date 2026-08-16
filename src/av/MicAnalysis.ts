/**
 * MicAnalysis.ts
 * Resolves placed microphone instances against catalog pickup data.
 * Directional sector only when beamWidthDeg is present. Missing required
 * directional fields → DATA INCOMPLETE (not a silent disc).
 */

import type { EquipmentCatalog, EquipmentInstance, MicrophoneSpec } from '../catalog/EquipmentCatalog';
import type { Seat } from '../room/SeatingGenerator';
import type { CheckStatus } from './ViewingDistanceEngine';
import {
  evaluateRoomMicCoverage,
  evaluateSeatMicCoverage,
  pickupRegionFromMic,
  type MicCoverageModel,
  type MicPlacement,
  type PickupRegion,
  type SeatMicResult
} from './MicrophoneCoverageEngine';

export type MicIncompleteKind = 'radius' | 'directional' | null;

export interface ResolvedMicrophone extends MicPlacement {
  instanceId: string;
  name: string;
  y: number;
  productId: string;
  incomplete: boolean;
  incompleteKind: MicIncompleteKind;
  incompleteReason?: string;
  pickupRegion?: PickupRegion;
}

export function resolveMicModelFromCatalog(
  spec: MicrophoneSpec | undefined,
  rotationY: number
):
  | { ok: true; placement: Omit<MicPlacement, 'id' | 'x' | 'z'> }
  | { ok: false; kind: Exclude<MicIncompleteKind, null>; reason: string } {
  const radius = spec?.pickupRadiusM;
  if (!spec || radius == null || !(radius > 0)) {
    return {
      ok: false,
      kind: 'radius',
      reason: 'DATA INCOMPLETE — catalog record has no usable pickupRadiusM.'
    };
  }

  if (spec.coverageModel === 'omni') {
    return {
      ok: true,
      placement: { pickupRadiusM: radius, coverageModel: 'pickup_disc' }
    };
  }

  const wantsSector = spec.coverageModel === 'directional_sector' || spec.beamWidthDeg != null;
  if (wantsSector) {
    const width = spec.beamWidthDeg;
    if (width == null || !(width > 0) || width > 360) {
      return {
        ok: false,
        kind: 'directional',
        reason:
          'DATA INCOMPLETE — directional sector requested but catalog has no usable beamWidthDeg. Disc fallback is not applied (would invent an omnidirectional pattern).'
      };
    }
    return {
      ok: true,
      placement: {
        pickupRadiusM: radius,
        coverageModel: 'directional_sector',
        beamWidthDeg: width,
        facingRad: rotationY
      }
    };
  }

  return {
    ok: true,
    placement: {
      pickupRadiusM: radius,
      coverageModel: 'pickup_disc'
    }
  };
}

export function resolveProjectMicrophones(
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog
): ResolvedMicrophone[] {
  const out: ResolvedMicrophone[] = [];
  equipment.forEach((inst) => {
    const product = catalog.get(inst.productId);
    if (!product || product.category !== 'microphone') return;
    const resolved = resolveMicModelFromCatalog(product.microphone, inst.rotationY);
    if (!resolved.ok) {
      out.push({
        id: inst.instanceId,
        instanceId: inst.instanceId,
        name: inst.name,
        productId: inst.productId,
        x: inst.position.x,
        y: inst.position.y,
        z: inst.position.z,
        pickupRadiusM: 0,
        incomplete: true,
        incompleteKind: resolved.kind,
        incompleteReason: resolved.reason
      });
      return;
    }
    const placement: MicPlacement = {
      id: inst.instanceId,
      x: inst.position.x,
      z: inst.position.z,
      ...resolved.placement
    };
    out.push({
      ...placement,
      instanceId: inst.instanceId,
      name: inst.name,
      y: inst.position.y,
      productId: inst.productId,
      incomplete: false,
      incompleteKind: null,
      pickupRegion: pickupRegionFromMic(placement)
    });
  });
  return out;
}

export function usableMicPlacements(resolved: ResolvedMicrophone[]): MicPlacement[] {
  return resolved
    .filter((m) => !m.incomplete)
    .map((m) => ({
      id: m.id,
      x: m.x,
      z: m.z,
      pickupRadiusM: m.pickupRadiusM,
      coverageModel: m.coverageModel,
      facingRad: m.facingRad,
      beamWidthDeg: m.beamWidthDeg
    }));
}

export function analyzeSeatsAgainstMics(
  seats: Seat[],
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog
): SeatMicResult[] {
  const mics = usableMicPlacements(resolveProjectMicrophones(equipment, catalog));
  return seats.map((s) => evaluateSeatMicCoverage({ seatId: s.id, x: s.x, z: s.z }, mics));
}

export function computeSeatMicStatuses(
  seats: Seat[],
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog
): Map<string, CheckStatus> {
  const map = new Map<string, CheckStatus>();
  analyzeSeatsAgainstMics(seats, equipment, catalog).forEach((r) => map.set(r.seatId, r.status));
  return map;
}

export function summarizeMicCoverage(
  seats: Seat[],
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog
) {
  const mics = usableMicPlacements(resolveProjectMicrophones(equipment, catalog));
  return evaluateRoomMicCoverage(
    seats.map((s) => ({ seatId: s.id, x: s.x, z: s.z })),
    mics
  );
}

export function modelLabel(model: MicCoverageModel | undefined): string {
  if (model === 'directional_sector') return 'Directional sector';
  return 'Pickup-radius estimate (disc)';
}
