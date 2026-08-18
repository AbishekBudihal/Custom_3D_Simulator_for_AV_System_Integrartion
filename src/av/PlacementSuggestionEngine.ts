/**
 * PlacementSuggestionEngine.ts
 * ────────────────────────────────────────────────────────────
 * Turns "add this product to the design" into a proposed, explainable
 * starting position instead of a raw "click the floor to place it"
 * interaction. The engineer still reviews and can adjust every value
 * before it's committed to the project (AppState.equipment) — nothing
 * here silently mutates the project.
 *
 * HONESTY NOTE: these are documented heuristics (grid coverage,
 * common mounting-height conventions), not a solver or a licensed
 * standard. Each suggestion function says so in its rationale/method
 * string, matching the posture already used in ViewingDistanceEngine
 * and SpeakerCoverageEngine.
 * ────────────────────────────────────────────────────────────
 */

import type { RoomModel } from '../room/RoomModel';
import type { Seat, TableSpec } from '../room/SeatingGenerator';
import type { EquipmentProduct } from '../catalog/EquipmentCatalog';
import {
  computeWallCandidates,
  getPresentationWall,
  presentationRotation,
  wallMountPoint,
  type WallCandidate,
  type WallKey
} from '../room/RoomGeometry';
import { scorePlacementWalls, selectPresentationWall } from './placement/PlacementCandidateEngine';
import {
  evaluateRoomAudioCoverage,
  type SpeakerPlacement,
  type CoverageSeat
} from './SpeakerCoverageEngine';
import {
  evaluateRoomMicCoverage,
  suggestMicPlacement,
  type MicPlacement,
  type MicCoverageSeat
} from './MicrophoneCoverageEngine';

const EAR_HEIGHT_SEATED_M = 1.2;
const DISPLAY_BOTTOM_AFF_M = 1.2; // common baseline: keeps content visible over seated heads, comfortable for a standing presenter
// Side clearance added on top of the screen's own width when checking whether
// a wall span is wide enough — keeps the display from sitting edge-to-edge
// against a door/window exclusion zone.
const DISPLAY_SIDE_CLEARANCE_M = 0.3;

export interface DisplayPlacementSuggestion {
  wall: WallKey;
  mount: 'wall' | 'cart';
  centerHeightM: number;
  position: { x: number; y: number; z: number };
  rationale: string;
  /** Every wall's score/obstruction info, best-first — lets the UI show why
   *  this wall (and not another) was picked, and lets the wall dropdown's
   *  manual override still avoid doors/windows via centerDisplayOnWall. */
  candidates: WallCandidate[];
}

function requiredFootprint(product: EquipmentProduct): { widthM: number; heightM: number } {
  return {
    widthM: product.physical.width + DISPLAY_SIDE_CLEARANCE_M,
    heightM: 0 // vertical fit is checked separately against centerHeightM/room.height below
  };
}

function centerHeightFor(room: RoomModel, product: EquipmentProduct): number {
  const screenHeight = product.physical.height;
  const centerHeightM = Math.min(DISPLAY_BOTTOM_AFF_M + screenHeight / 2, room.height - 0.25);
  return Number(centerHeightM.toFixed(2));
}

/**
 * Places a display centered in the clearest available span of `wall`,
 * never overlapping a door/window exclusion zone on that wall. Used both
 * by suggestDisplayPlacement (auto-pick the wall) and by the UI when the
 * engineer manually overrides which wall to use — both paths must avoid
 * doors, so both go through this rather than assuming wall-center = x/z=0.
 */
export function centerDisplayOnWall(
  room: RoomModel,
  product: EquipmentProduct,
  wall: WallKey
): { x: number; y: number; z: number; rotationY: number; fitsClear: boolean } {
  const { widthM } = requiredFootprint(product);
  const candidate = computeWallCandidates(room, widthM, 0).find((c) => c.wall === wall)!;
  const alongCenter = candidate.bestSpanStartM + candidate.usableWidthM / 2;
  const inset = room.wallThickness + 0.03;
  const { x, z } = wallMountPoint(room, wall, alongCenter, inset);
  return {
    x: Number(x.toFixed(2)),
    y: centerHeightFor(room, product),
    z: Number(z.toFixed(2)),
    rotationY: presentationRotation(wall),
    fitsClear: candidate.valid
  };
}

/**
 * Evaluates all four walls as candidate mounting surfaces (§1/§7 of the
 * spatial model) and picks the best-scoring one that actually fits the
 * display clear of any door/window — never "the nearest wall" or a
 * hardcoded 'front'. Falls back to the room's designated presentation
 * wall when nothing on the wall's own merits stands out, and to the
 * best-scoring wall overall (with a warning) only if literally nothing
 * fits.
 */
export function suggestDisplayPlacement(
  room: RoomModel,
  product: EquipmentProduct,
  ctx: { seats?: Seat[]; tables?: TableSpec[] } = {}
): DisplayPlacementSuggestion {
  const canWallMount = product.mounting?.wall ?? true;
  const mount: 'wall' | 'cart' = canWallMount ? 'wall' : 'cart';

  const { widthM } = requiredFootprint(product);
  const candidates = computeWallCandidates(room, widthM, 0);
  const ranked = scorePlacementWalls(room, {
    product,
    seats: ctx.seats,
    tables: ctx.tables
  });

  const honorOverride = !!room.presentationWall && !(ctx.seats && ctx.seats.length);
  const preferred = honorOverride ? room.presentationWall! : selectPresentationWall(room, {
    product,
    seats: ctx.seats,
    tables: ctx.tables
  });

  const preferredCandidate = candidates.find((c) => c.wall === preferred && c.valid);
  const scoredBest = ranked.find((c) => !c.rejected);
  const best = honorOverride
    ? preferredCandidate ?? candidates.find((c) => c.valid) ?? candidates[0]
    : candidates.find((c) => c.wall === scoredBest?.wall) ?? preferredCandidate ?? candidates.find((c) => c.valid) ?? candidates[0];

  const centerHeightM = centerHeightFor(room, product);
  const alongCenter = best.bestSpanStartM + best.usableWidthM / 2;
  const inset = room.wallThickness + 0.03;
  const { x, z } = wallMountPoint(room, best.wall, alongCenter, inset);

  const av = ranked.find((c) => c.wall === best.wall);
  const rejectionNotes = ranked
    .filter((c) => c.wall !== best.wall)
    .slice(0, 3)
    .map((c) => `${c.wall}: ${c.reasons[0] ?? 'lower score'}`);

  const rationaleParts = [
    `Bottom of screen set to ${DISPLAY_BOTTOM_AFF_M}m AFF, centered in the ${best.wall} wall's clear ${best.usableWidthM.toFixed(1)}m span.`
  ];
  if (av?.reasons.length) rationaleParts.push(av.reasons.slice(0, 3).join('; ') + '.');
  if (best.hasDoor || best.hasWindow) {
    rationaleParts.push(`That wall has an opening, but the display is centered in the remaining clear area so it never overlaps it.`);
  }
  if (!best.valid) {
    rationaleParts.push(
      `Warning: no wall has ${widthM.toFixed(1)}m of clear width for this display — using the best available (${best.wall} wall, ${best.usableWidthM.toFixed(1)}m clear).`
    );
  }
  if (rejectionNotes.length) {
    rationaleParts.push(`Other walls: ${rejectionNotes.join('; ')}.`);
  }
  rationaleParts.push('Starting placement from spatial scoring plus the existing viewing engine — not a licensed DISCAS solver.');

  return {
    wall: best.wall,
    mount,
    centerHeightM,
    position: { x: Number(x.toFixed(2)), y: centerHeightM, z: Number(z.toFixed(2)) },
    rationale: rationaleParts.join(' '),
    candidates
  };
}


export interface SpeakerDesignSuggestion {
  quantity: number;
  layout: string;
  speakers: SpeakerPlacement[];
  coveragePct: number;
  totalSeats: number;
  coveredSeats: number;
  method: string;
}

/**
 * Proposes a distributed-ceiling speaker grid sized from the product's
 * rated dispersion angle and the room's ceiling height, then scores it
 * against the actual seats using SpeakerCoverageEngine — the same
 * engine used for post-hoc analysis, so the suggestion and the
 * evaluation never disagree with each other.
 */
export function suggestSpeakerDesign(room: RoomModel, seats: Seat[], product: EquipmentProduct): SpeakerDesignSuggestion {
  const spec = product.speaker;
  if (!spec) throw new Error('suggestSpeakerDesign requires a product with a speaker spec');

  if (spec.dispersionDeg == null || !(spec.dispersionDeg > 0) || spec.maxSplAt1m == null || !(spec.maxSplAt1m > 0)) {
    throw new Error('suggestSpeakerDesign requires catalog dispersionDeg and maxSplAt1m');
  }

  const mountHeight = Math.max(1.5, room.height - 0.15);
  const dropHeight = Math.max(0.3, mountHeight - EAR_HEIGHT_SEATED_M);
  const coverageRadius = Math.max(0.6, dropHeight * Math.tan(((spec.dispersionDeg / 2) * Math.PI) / 180));

  const cols = Math.max(1, Math.ceil(room.width / (coverageRadius * 1.7)));
  const rows = Math.max(1, Math.ceil(room.depth / (coverageRadius * 1.7)));

  const speakers: SpeakerPlacement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Number((-room.width / 2 + (room.width / cols) * (c + 0.5)).toFixed(2));
      const z = Number((-room.depth / 2 + (room.depth / rows) * (r + 0.5)).toFixed(2));
      speakers.push({
        id: `SPK-${speakers.length + 1}`,
        x,
        y: mountHeight,
        z,
        mount: 'ceiling',
        facingRad: 0,
        dispersionDeg: spec.dispersionDeg,
        maxSplAt1m: spec.maxSplAt1m
      });
    }
  }

  const coverageSeats: CoverageSeat[] = seats.map((s) => ({ seatId: s.id, x: s.x, z: s.z, earHeightM: EAR_HEIGHT_SEATED_M }));
  const result = evaluateRoomAudioCoverage(coverageSeats, speakers);

  return {
    quantity: speakers.length,
    layout: `Distributed ceiling grid (${cols}×${rows})`,
    speakers,
    coveragePct: result.coveragePct,
    totalSeats: result.totalSeats,
    coveredSeats: result.coveredSeats,
    method: `Grid spacing derived from ${product.manufacturer} ${product.model}'s rated ${spec.dispersionDeg}° dispersion at a ${mountHeight.toFixed(1)}m ceiling mount, then scored against actual seat positions with the same geometric coverage model used for analysis (not a validated acoustic simulation).`
  };
}

export interface MicDesignSuggestion {
  quantity: number;
  placements: MicPlacement[];
  coveragePct: number;
  totalSeats: number;
  coveredSeats: number;
  method: string;
}

export function suggestMicDesign(seats: Seat[], product: EquipmentProduct, maxMics = 6): MicDesignSuggestion {
  const spec = product.microphone;
  if (!spec) throw new Error('suggestMicDesign requires a product with a microphone spec');

  const micSeats: MicCoverageSeat[] = seats.map((s) => ({ seatId: s.id, x: s.x, z: s.z }));
  const placements = suggestMicPlacement(micSeats, spec.pickupRadiusM, maxMics);
  const result = evaluateRoomMicCoverage(micSeats, placements);

  return {
    quantity: placements.length,
    placements,
    coveragePct: result.coveragePct,
    totalSeats: result.totalSeats,
    coveredSeats: result.coveredSeats,
    method: `Greedy placement using ${product.manufacturer} ${product.model}'s rated ${spec.pickupRadiusM}m pickup radius as a flat coverage disc, capped at ${maxMics} units. Simplified vs. real beamforming pickup patterns — same model used for analysis.`
  };
}
