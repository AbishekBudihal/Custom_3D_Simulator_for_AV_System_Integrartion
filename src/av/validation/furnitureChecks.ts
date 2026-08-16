/**
 * Furniture / layout validation. Geometry-based — not a furniture score.
 */

import type { ProjectValidationContext } from './ValidationContext';
import type { ValidationCheck, ValidationFinding } from './ValidationTypes';
import {
  aabbsOverlap,
  aabbInsideRoom,
  chairAabb,
  minWallClearance,
  openingExclusionAabb,
  presentationZoneAabb,
  tableAabb,
  WALKWAY_CLEARANCE_M,
  WALL_CLEARANCE_M
} from '../../room/FurnitureGeometry';
import { defaultSeatingConfig, generateSeating } from '../../room/SeatingGenerator';

function finding(
  partial: Omit<ValidationFinding, 'affectedObjects' | 'recommendedActions' | 'potentialVariables'> & {
    affectedObjects?: ValidationFinding['affectedObjects'];
    recommendedActions?: string[];
    potentialVariables?: string[];
  }
): ValidationFinding {
  return {
    affectedObjects: [],
    recommendedActions: [],
    potentialVariables: [],
    ...partial
  };
}

export const checkFurnTableWall: ValidationCheck = {
  code: 'FURN-001',
  category: 'furniture',
  title: 'Table intersects wall',
  evaluate(ctx: ProjectValidationContext): ValidationFinding[] {
    if (!ctx.room) return [];
    const bad = ctx.tables.filter((t) => !aabbInsideRoom(ctx.room!, tableAabb(t), 0.02));
    if (bad.length === 0) {
      return [
        finding({
          id: 'FURN-001',
          code: 'FURN-001',
          severity: 'pass',
          category: 'furniture',
          title: 'Table within room',
          message: 'Table footprints stay inside the room envelope.',
          explanation: 'Each TableSpec AABB is inside the inner wall planes.',
          source: 'TableSpec AABB vs room width/depth.'
        })
      ];
    }
    return bad.map((t) =>
      finding({
        id: `FURN-001:${t.id}`,
        code: 'FURN-001',
        severity: 'error',
        category: 'furniture',
        title: 'Table intersects wall',
        message: `Table ${t.id} extends outside the room envelope.`,
        explanation: 'Furniture must remain inside the architectural envelope.',
        objectId: t.id,
        affectedObjects: [{ kind: 'table', id: t.id, label: t.id }],
        recommendedActions: ['Move the table inward', 'Reduce table size', 'Increase room size'],
        potentialVariables: ['Table position', 'Room size'],
        source: 'TableSpec AABB vs room width/depth.'
      })
    );
  }
};

export const checkFurnOpenings: ValidationCheck = {
  code: 'FURN-002',
  category: 'furniture',
  title: 'Table intersects door/window exclusion',
  evaluate(ctx: ProjectValidationContext): ValidationFinding[] {
    if (!ctx.room) return [];
    const hits: ValidationFinding[] = [];
    for (const t of ctx.tables) {
      const box = tableAabb(t);
      for (const o of ctx.room.openings) {
        const ex = openingExclusionAabb(ctx.room, o.wall, o.offset, o.width);
        if (aabbsOverlap(box, ex)) {
          hits.push(
            finding({
              id: `FURN-002:${t.id}:${o.id ?? o.kind}`,
              code: 'FURN-002',
              severity: 'error',
              category: 'furniture',
              title: 'Table intersects door/window exclusion',
              message: `Table ${t.id} overlaps a ${o.kind} exclusion zone.`,
              explanation: 'Doors and windows need a keep-out volume into the room for circulation.',
              objectId: t.id,
              affectedObjects: [{ kind: 'table', id: t.id, label: t.id }],
              recommendedActions: ['Move the table away from the opening', 'Change layout'],
              potentialVariables: ['Table position', 'Opening location'],
              source: 'TableSpec AABB vs opening exclusion volume from RoomGeometry.wallOffsetToWorld.'
            })
          );
        }
      }
    }
    if (hits.length) return hits;
    return [
      finding({
        id: 'FURN-002',
        code: 'FURN-002',
        severity: 'pass',
        category: 'furniture',
        title: 'Openings clear',
        message: 'Tables do not overlap door/window exclusion zones.',
        explanation: 'Checked TableSpec against opening keep-out volumes.',
        source: 'Opening exclusion AABB from wall offset convention.'
      })
    ];
  }
};

export const checkFurnCirculation: ValidationCheck = {
  code: 'FURN-003',
  category: 'furniture',
  title: 'Insufficient circulation clearance',
  evaluate(ctx: ProjectValidationContext): ValidationFinding[] {
    if (!ctx.room || ctx.tables.length === 0) return [];
    const findings: ValidationFinding[] = [];
    for (const t of ctx.tables) {
      const actual = minWallClearance(ctx.room, tableAabb(t));
      if (actual < WALKWAY_CLEARANCE_M) {
        findings.push(
          finding({
            id: `FURN-003:${t.id}`,
            code: 'FURN-003',
            severity: actual < WALL_CLEARANCE_M ? 'error' : 'warning',
            category: 'furniture',
            title: 'Insufficient circulation clearance',
            message: `Circulation around ${t.id} is ${actual.toFixed(2)} m (required ${WALKWAY_CLEARANCE_M} m).`,
            explanation: 'A usable layout needs walkway clearance around furniture, not only “inside the room”.',
            metric: {
              name: 'Wall/circulation clearance',
              actual: actual.toFixed(2),
              expected: String(WALKWAY_CLEARANCE_M),
              unit: 'm'
            },
            objectId: t.id,
            affectedObjects: [{ kind: 'table', id: t.id, label: t.id }],
            recommendedActions: ['Reduce seating', 'Change layout', 'Increase room size'],
            potentialVariables: ['Seat count', 'Table size', 'Room size'],
            source: `Minimum gap from TableSpec AABB to room walls. Required walkway ${WALKWAY_CLEARANCE_M} m.`
          })
        );
      }
    }
    if (findings.length) return findings;
    return [
      finding({
        id: 'FURN-003',
        code: 'FURN-003',
        severity: 'pass',
        category: 'furniture',
        title: 'Circulation',
        message: `Tables keep at least ${WALKWAY_CLEARANCE_M} m to the nearest wall.`,
        explanation: 'Walkway clearance measured from TableSpec to room walls.',
        source: `Required ${WALKWAY_CLEARANCE_M} m walkway.`
      })
    ];
  }
};

export const checkFurnChairTable: ValidationCheck = {
  code: 'FURN-004',
  category: 'furniture',
  title: 'Chair intersects table',
  evaluate(ctx: ProjectValidationContext): ValidationFinding[] {
    const hits: ValidationFinding[] = [];
    for (const s of ctx.seats) {
      const c = chairAabb(s);
      for (const t of ctx.tables) {
        if (aabbsOverlap(c, tableAabb(t), 0.04)) {
          hits.push(
            finding({
              id: `FURN-004:${s.id}:${t.id}`,
              code: 'FURN-004',
              severity: 'error',
              category: 'furniture',
              title: 'Chair intersects table',
              message: `Seat ${s.id} overlaps table ${t.id}.`,
              explanation: 'Chairs are placed from table seating positions and must sit outside the tabletop footprint.',
              objectId: s.id,
              affectedObjects: [
                { kind: 'seat', id: s.id, label: s.id },
                { kind: 'table', id: t.id, label: t.id }
              ],
              recommendedActions: ['Regenerate seating', 'Move the chair'],
              potentialVariables: ['Seat position', 'Table size'],
              source: 'Seat AABB vs TableSpec AABB.'
            })
          );
        }
      }
    }
    if (hits.length) return hits;
    if (!ctx.tables.length || !ctx.seats.length) return [];
    return [
      finding({
        id: 'FURN-004',
        code: 'FURN-004',
        severity: 'pass',
        category: 'furniture',
        title: 'Chairs clear tables',
        message: 'Seat footprints do not overlap table footprints.',
        explanation: 'Compared each seat AABB with each TableSpec.',
        source: 'Seat AABB vs TableSpec AABB.'
      })
    ];
  }
};

export const checkFurnChairClearance: ValidationCheck = {
  code: 'FURN-005',
  category: 'furniture',
  title: 'Chair clearance insufficient',
  evaluate(ctx: ProjectValidationContext): ValidationFinding[] {
    if (!ctx.room || ctx.seats.length === 0) return [];
    const tight = ctx.seats.filter((s) => minWallClearance(ctx.room!, chairAabb(s)) < 0.45);
    if (tight.length === 0) {
      return [
        finding({
          id: 'FURN-005',
          code: 'FURN-005',
          severity: 'pass',
          category: 'furniture',
          title: 'Chair clearance',
          message: 'Seats keep at least 0.45 m to the nearest wall.',
          explanation: 'Chair AABB to room walls.',
          source: 'Required 0.45 m behind/beside chairs.'
        })
      ];
    }
    return [
      finding({
        id: 'FURN-005',
        code: 'FURN-005',
        severity: 'warning',
        category: 'furniture',
        title: 'Chair clearance insufficient',
        message: `${tight.length} seat(s) have less than 0.45 m to a wall.`,
        explanation: 'Pull-out and circulation behind chairs is part of a usable layout.',
        metric: {
          name: 'Chair-to-wall clearance',
          actual: Math.min(...tight.map((s) => minWallClearance(ctx.room!, chairAabb(s)))).toFixed(2),
          expected: '0.45',
          unit: 'm'
        },
        affectedObjects: tight.slice(0, 12).map((s) => ({ kind: 'seat' as const, id: s.id, label: s.id })),
        recommendedActions: ['Reduce seating', 'Change layout', 'Increase room size'],
        potentialVariables: ['Seat count', 'Room size'],
        source: 'Chair AABB to room walls. Required 0.45 m.'
      })
    ];
  }
};

export const checkFurnSeatingFits: ValidationCheck = {
  code: 'FURN-006',
  category: 'furniture',
  title: 'Requested seating does not fit room',
  evaluate(ctx: ProjectValidationContext): ValidationFinding[] {
    if (!ctx.room) return [];
    const n = ctx.seats.length;
    if (n === 0) return [];
    const layout = ctx.tables.length <= 1 ? 'boardroom' : ctx.tables.length === 3 ? 'u_shape' : ctx.tables.length >= 4 ? 'hollow_square' : 'classroom';
    const gen = generateSeating(ctx.room, defaultSeatingConfig(n, layout));
    if (gen.valid) {
      return [
        finding({
          id: 'FURN-006',
          code: 'FURN-006',
          severity: 'pass',
          category: 'furniture',
          title: 'Seating fits',
          message: `${n} seats fit the room with required circulation for a ${layout} layout.`,
          explanation: 'Re-ran SeatingGenerator for the current seat count and inferred layout.',
          source: 'SeatingGenerator.valid for current seat count.'
        })
      ];
    }
    return [
      finding({
        id: 'FURN-006',
        code: 'FURN-006',
        severity: 'error',
        category: 'furniture',
        title: 'Requested seating does not fit room',
        message: gen.warnings[0] ?? `${n} seats cannot be accommodated with the selected room dimensions and required circulation.`,
        explanation: 'The furniture-first generator reports the layout as not physically usable.',
        affectedObjects: ctx.tables.map((t) => ({ kind: 'table' as const, id: t.id, label: t.id })),
        recommendedActions: ['Reduce seating', 'Change layout', 'Increase room size', 'Manual design'],
        potentialVariables: ['Seat count', 'Layout', 'Room size'],
        source: 'SeatingGenerator.valid / circulation envelope.'
      })
    ];
  }
};

export const checkFurnPresentationZone: ValidationCheck = {
  code: 'FURN-007',
  category: 'furniture',
  title: 'Furniture blocks presentation zone',
  evaluate(ctx: ProjectValidationContext): ValidationFinding[] {
    if (!ctx.room || ctx.tables.length === 0) return [];
    const zone = presentationZoneAabb(ctx.room);
    const blockers = ctx.tables.filter((t) => {
      const conference = t.furnitureId?.includes('conference') || t.furnitureId?.includes('boardroom') || t.furnitureId?.includes('small-meeting') || t.id === 'conference-table';
      return conference && aabbsOverlap(tableAabb(t), zone, 0.05);
    });
    if (blockers.length === 0) {
      return [
        finding({
          id: 'FURN-007',
          code: 'FURN-007',
          severity: 'pass',
          category: 'furniture',
          title: 'Presentation zone',
          message: 'Tables stay out of the presentation-wall keep-out strip.',
          explanation: `A ${1.2} m zone along the presentation wall is reserved for display viewing.`,
          source: 'TableSpec vs presentation-wall zone AABB.'
        })
      ];
    }
    return blockers.map((t) =>
      finding({
        id: `FURN-007:${t.id}`,
        code: 'FURN-007',
        severity: 'error',
        category: 'furniture',
        title: 'Furniture blocks presentation zone',
        message: `Table ${t.id} enters the presentation keep-out zone.`,
        explanation: 'The table must sit behind the display viewing / presenter zone.',
        objectId: t.id,
        affectedObjects: [{ kind: 'table', id: t.id, label: t.id }],
        recommendedActions: ['Move furniture away from the presentation wall', 'Change layout'],
        potentialVariables: ['Table position', 'Presentation wall'],
        source: 'TableSpec vs presentation-wall zone AABB (1.2 m).'
      })
    );
  }
};

export const FURNITURE_CHECKS: ValidationCheck[] = [
  checkFurnTableWall,
  checkFurnOpenings,
  checkFurnCirculation,
  checkFurnChairTable,
  checkFurnChairClearance,
  checkFurnSeatingFits,
  checkFurnPresentationZone
];
