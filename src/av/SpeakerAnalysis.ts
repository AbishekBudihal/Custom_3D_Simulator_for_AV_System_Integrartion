/**
 * SpeakerAnalysis.ts
 * Resolves catalog speakers into SpeakerCoverageEngine placements.
 * Missing maxSplAt1m or dispersion → DATA INCOMPLETE (no invented 100 dB / 90°).
 */

import type { EquipmentCatalog, EquipmentInstance, SpeakerSpec } from '../catalog/EquipmentCatalog';
import type { Seat } from '../room/SeatingGenerator';
import type { CheckStatus } from './ViewingDistanceEngine';
import {
  AUDIO_METHOD,
  DEFAULT_EAR_HEIGHT_M,
  coverageRegionFromSpeaker,
  evaluateRoomAudioCoverage,
  evaluateSeatAudio,
  type ListeningZone,
  type SeatAudioResult,
  type SpeakerCoverageRegion,
  type SpeakerPlacement
} from './SpeakerCoverageEngine';

export type SpeakerIncompleteKind = 'spl' | 'dispersion' | null;

export interface ResolvedSpeaker extends SpeakerPlacement {
  instanceId: string;
  name: string;
  productId: string;
  incomplete: boolean;
  incompleteKind: SpeakerIncompleteKind;
  incompleteReason?: string;
  coverageRegion?: SpeakerCoverageRegion;
}

export function resolveSpeakerFromCatalog(
  spec: SpeakerSpec | undefined,
  inst: EquipmentInstance
):
  | { ok: true; placement: Omit<SpeakerPlacement, 'id' | 'x' | 'y' | 'z'> }
  | { ok: false; kind: Exclude<SpeakerIncompleteKind, null>; reason: string } {
  if (!spec) {
    return { ok: false, kind: 'spl', reason: 'DATA INCOMPLETE — product has no speaker specification block.' };
  }
  const spl = spec.maxSplAt1m;
  if (spl == null || !(spl > 0)) {
    return {
      ok: false,
      kind: 'spl',
      reason: 'DATA INCOMPLETE — catalog has no usable maxSplAt1m. A reference level is not invented.'
    };
  }
  const hasNominal = spec.dispersionDeg != null && spec.dispersionDeg > 0;
  const hasHV =
    spec.horizontalDispersionDeg != null &&
    spec.horizontalDispersionDeg > 0 &&
    spec.verticalDispersionDeg != null &&
    spec.verticalDispersionDeg > 0;
  if (!hasNominal && !hasHV) {
    return {
      ok: false,
      kind: 'dispersion',
      reason: 'DATA INCOMPLETE — catalog has no usable dispersionDeg or horizontal+vertical dispersion. Angles are not invented.'
    };
  }
  return {
    ok: true,
    placement: {
      mount: spec.mount,
      facingRad: inst.rotationY,
      dispersionDeg: hasNominal ? spec.dispersionDeg : undefined,
      horizontalDispersionDeg: hasHV ? spec.horizontalDispersionDeg : undefined,
      verticalDispersionDeg: hasHV ? spec.verticalDispersionDeg : undefined,
      maxSplAt1m: spl
    }
  };
}

export function resolveProjectSpeakers(
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog
): ResolvedSpeaker[] {
  const out: ResolvedSpeaker[] = [];
  equipment.forEach((inst) => {
    const product = catalog.get(inst.productId);
    if (!product || product.category !== 'speaker') return;
    const resolved = resolveSpeakerFromCatalog(product.speaker, inst);
    if (!resolved.ok) {
      out.push({
        id: inst.instanceId,
        instanceId: inst.instanceId,
        name: inst.name,
        productId: inst.productId,
        x: inst.position.x,
        y: inst.position.y,
        z: inst.position.z,
        mount: product.speaker?.mount ?? 'ceiling',
        facingRad: inst.rotationY,
        maxSplAt1m: 0,
        incomplete: true,
        incompleteKind: resolved.kind,
        incompleteReason: resolved.reason
      });
      return;
    }
    const placement: SpeakerPlacement = {
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
      incompleteKind: null,
      coverageRegion: coverageRegionFromSpeaker(placement) ?? undefined
    });
  });
  return out;
}

export function usableSpeakerPlacements(resolved: ResolvedSpeaker[]): SpeakerPlacement[] {
  return resolved
    .filter((s) => !s.incomplete)
    .map((s) => ({
      id: s.id,
      x: s.x,
      y: s.y,
      z: s.z,
      mount: s.mount,
      facingRad: s.facingRad,
      dispersionDeg: s.dispersionDeg,
      horizontalDispersionDeg: s.horizontalDispersionDeg,
      verticalDispersionDeg: s.verticalDispersionDeg,
      maxSplAt1m: s.maxSplAt1m
    }));
}

export function seatsAsCoverageTargets(seats: Seat[], zone: ListeningZone = 'main_seating') {
  return seats.map((s) => ({
    seatId: s.id,
    x: s.x,
    z: s.z,
    earHeightM: DEFAULT_EAR_HEIGHT_M,
    zone
  }));
}

export function summarizeSpeakerCoverage(
  seats: Seat[],
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog
) {
  const speakers = usableSpeakerPlacements(resolveProjectSpeakers(equipment, catalog));
  return evaluateRoomAudioCoverage(seatsAsCoverageTargets(seats), speakers);
}

export function computeSeatAudioStatuses(
  seats: Seat[],
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog
): Map<string, CheckStatus> {
  const map = new Map<string, CheckStatus>();
  const speakers = usableSpeakerPlacements(resolveProjectSpeakers(equipment, catalog));
  seatsAsCoverageTargets(seats).forEach((seat) => {
    map.set(seat.seatId, evaluateSeatAudio(seat, speakers).value.status);
  });
  return map;
}

export function analyzeSeatAudio(
  seat: Seat,
  equipment: EquipmentInstance[],
  catalog: EquipmentCatalog
): SeatAudioResult {
  const speakers = usableSpeakerPlacements(resolveProjectSpeakers(equipment, catalog));
  return evaluateSeatAudio(
    { seatId: seat.id, x: seat.x, z: seat.z, earHeightM: DEFAULT_EAR_HEIGHT_M, zone: 'main_seating' },
    speakers
  ).value;
}

export { AUDIO_METHOD };
