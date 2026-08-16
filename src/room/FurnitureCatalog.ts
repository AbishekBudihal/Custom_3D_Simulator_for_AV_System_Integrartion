/**
 * Generic furniture templates — not manufacturer SKUs.
 * Catalog-shaped so real products can replace these later.
 */

export type FurnitureShape = 'rect' | 'rounded_rect' | 'ellipse';

export type FurnitureCategory =
  | 'small_meeting'
  | 'conference'
  | 'boardroom'
  | 'training'
  | 'u_segment'
  | 'square_segment';

export interface FurnitureTemplate {
  id: string;
  name: string;
  category: FurnitureCategory;
  shape: FurnitureShape;
  /** Typical across-table width (people face each other across this). */
  typicalWidth: number;
  typicalHeight: number;
  typicalThickness: number;
  recommendedSeatSpacing: number;
  clearanceFront: number;
  clearanceRear: number;
  clearanceSide: number;
  chairFromEdge: number;
  seatCapacity?: number;
  provenance: 'user_defined';
  source: string;
}

/** Catalog-shaped furniture record. Generic templates only — not manufacturer SKUs. */
export type FurnitureSpec = FurnitureTemplate;

export const FURNITURE_TEMPLATES: FurnitureTemplate[] = [
  {
    id: 'generic-small-meeting',
    name: 'Generic small meeting table',
    category: 'small_meeting',
    shape: 'rounded_rect',
    typicalWidth: 0.9,
    typicalHeight: 0.73,
    typicalThickness: 0.04,
    recommendedSeatSpacing: 0.65,
    clearanceFront: 1.5,
    clearanceRear: 0.9,
    clearanceSide: 0.9,
    chairFromEdge: 0.4,
    provenance: 'user_defined',
    source: 'Generic template — not a manufacturer product.'
  },
  {
    id: 'generic-conference',
    name: 'Generic conference table',
    category: 'conference',
    shape: 'rounded_rect',
    typicalWidth: 1.2,
    typicalHeight: 0.73,
    typicalThickness: 0.04,
    recommendedSeatSpacing: 0.65,
    clearanceFront: 1.7,
    clearanceRear: 0.9,
    clearanceSide: 0.9,
    chairFromEdge: 0.4,
    provenance: 'user_defined',
    source: 'Generic template — not a manufacturer product.'
  },
  {
    id: 'generic-boardroom',
    name: 'Generic boardroom table',
    category: 'boardroom',
    shape: 'rounded_rect',
    typicalWidth: 1.4,
    typicalHeight: 0.73,
    typicalThickness: 0.04,
    recommendedSeatSpacing: 0.65,
    clearanceFront: 1.8,
    clearanceRear: 0.9,
    clearanceSide: 0.9,
    chairFromEdge: 0.42,
    provenance: 'user_defined',
    source: 'Generic template — not a manufacturer product.'
  },
  {
    id: 'generic-training-desk',
    name: 'Generic training desk',
    category: 'training',
    shape: 'rect',
    typicalWidth: 0.55,
    typicalHeight: 0.73,
    typicalThickness: 0.03,
    recommendedSeatSpacing: 0.6,
    clearanceFront: 1.5,
    clearanceRear: 0.85,
    clearanceSide: 0.7,
    chairFromEdge: 0.38,
    provenance: 'user_defined',
    source: 'Generic template — not a manufacturer product.'
  },
  {
    id: 'generic-u-segment',
    name: 'Generic U-shape table segment',
    category: 'u_segment',
    shape: 'rect',
    typicalWidth: 0.55,
    typicalHeight: 0.73,
    typicalThickness: 0.04,
    recommendedSeatSpacing: 0.65,
    clearanceFront: 1.8,
    clearanceRear: 0.9,
    clearanceSide: 0.85,
    chairFromEdge: 0.4,
    provenance: 'user_defined',
    source: 'Generic template — not a manufacturer product.'
  }
];

export function furnitureTemplate(id: string): FurnitureTemplate {
  return FURNITURE_TEMPLATES.find((t) => t.id === id) ?? FURNITURE_TEMPLATES[1];
}

/** Across-table width from occupancy — not room width. */
export function conferenceWidthForCapacity(n: number): number {
  if (n <= 4) return 0.9;
  if (n <= 8) return 1.2;
  if (n <= 12) return 1.35;
  return 1.5;
}

export function conferenceTemplateId(n: number): string {
  if (n <= 4) return 'generic-small-meeting';
  if (n <= 10) return 'generic-conference';
  return 'generic-boardroom';
}
