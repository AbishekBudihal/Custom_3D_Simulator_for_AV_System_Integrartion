/**
 * DisplayCriteria.ts
 * ────────────────────────────────────────────────────────────
 * ENGINEERING HONESTY NOTICE (see AppState/§40 in the product spec):
 *
 * AVIXA's actual Image System Contrast Ratio / Display Image Size
 * for 2D Content (DISCAS) standard defines viewer distance limits
 * using a formula tied to the display's image height and the
 * *task* being performed (Basic Decision Making, Analytical Decision
 * Making, Full-Motion Video), calibrated against visual acuity
 * (arc-minutes) — not a single universal ratio.
 *
 * This module does NOT claim to reproduce the licensed AVIXA
 * DISCAS standard verbatim. It implements a commonly-cited,
 * publicly-discussed simplified heuristic (the "4:6:8" rule of
 * thumb some AV designers use as a quick sanity check) and labels
 * every result as an ENGINEERING ESTIMATE. For real compliance
 * sign-off, purchase and apply the current AVIXA DISCAS standard
 * directly and use the `StandardsRegistry` to swap in that
 * methodology once you have the licensed calculation available.
 * ────────────────────────────────────────────────────────────
 */

export type ContentType = 'basic_decision' | 'analytical_decision' | 'full_motion_video';

export interface ViewingDistanceRange {
  minM: number;
  maxM: number;
  methodology: string;
  contentType: ContentType;
  source: 'engineering_estimate';
}

/**
 * Rule-of-thumb multipliers against image HEIGHT (not diagonal),
 * commonly cited in AV design practice as a quick planning heuristic:
 *   - Basic decision-making content: up to ~8x image height
 *   - Analytical decision-making content: up to ~6x image height
 *   - Full-motion video / general viewing: up to ~4x image height
 * Minimum distance in all cases is conventionally ~1.5x image height
 * (closer than that and pixel structure / edge distortion becomes
 * noticeable on most displays). These are NOT the licensed AVIXA
 * DISCAS arc-minute calculation — see notice above.
 */
const CONTENT_MULTIPLIERS: Record<ContentType, { min: number; max: number }> = {
  full_motion_video: { min: 1.5, max: 4 },
  analytical_decision: { min: 1.5, max: 6 },
  basic_decision: { min: 1.5, max: 8 }
};

export function imageHeightFromDiagonalInches(diagonalInches: number, aspectRatio = '16:9'): number {
  const [aw, ah] = aspectRatio.split(':').map(Number);
  const diagonalM = diagonalInches * 0.0254;
  const ratio = Math.sqrt(aw * aw + ah * ah);
  return diagonalM * (ah / ratio);
}

export function estimateViewingDistanceRange(
  diagonalInches: number,
  contentType: ContentType,
  aspectRatio = '16:9'
): ViewingDistanceRange {
  const imageHeight = imageHeightFromDiagonalInches(diagonalInches, aspectRatio);
  const mult = CONTENT_MULTIPLIERS[contentType];
  return {
    minM: Number((imageHeight * mult.min).toFixed(2)),
    maxM: Number((imageHeight * mult.max).toFixed(2)),
    methodology: `Image-height multiplier heuristic (${mult.min}x-${mult.max}x image height), commonly used as an AV design planning rule of thumb.`,
    contentType,
    source: 'engineering_estimate'
  };
}

/**
 * Recommends a minimum display diagonal so that the FARTHEST seat
 * still falls within the content type's max viewing distance.
 * Also an engineering estimate — see notice above.
 */
export function recommendDisplaySize(
  farthestSeatDistanceM: number,
  contentType: ContentType,
  aspectRatio = '16:9'
): { diagonalInches: number; methodology: string; source: 'engineering_estimate' } {
  const mult = CONTENT_MULTIPLIERS[contentType];
  const requiredImageHeight = farthestSeatDistanceM / mult.max;
  const [aw, ah] = aspectRatio.split(':').map(Number);
  const ratio = Math.sqrt(aw * aw + ah * ah);
  const diagonalM = (requiredImageHeight * ratio) / ah;
  const diagonalInches = diagonalM / 0.0254;
  return {
    diagonalInches: Math.ceil(diagonalInches / 5) * 5, // round up to nearest common size step
    methodology: `Sized so the farthest seat (${farthestSeatDistanceM.toFixed(1)}m) is within ${mult.max}x image height for ${contentType.replace('_', ' ')} content.`,
    source: 'engineering_estimate'
  };
}
