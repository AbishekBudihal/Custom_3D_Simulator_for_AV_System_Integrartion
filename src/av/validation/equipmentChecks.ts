/**
 * Equipment catalog / mounting validation. Existing display/viewing checks stay in builtinChecks.
 */

import type { ProjectValidationContext } from './ValidationContext';
import type { ValidationCheck, ValidationFinding } from './ValidationTypes';
import {
  catalogGeometryMismatch,
  defaultMountingKind,
  distanceToNearestWall,
  equipmentFootprint,
  physicalSpecComplete
} from '../../catalog/CatalogEngineering';
import { exclusiveCeiling, exclusiveFloor, exclusiveWall } from '../PlacementFeedback';
import { aabbsOverlap, openingExclusionAabb, tableAabb } from '../../room/FurnitureGeometry';

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

export const checkEquipPhysical: ValidationCheck = {
  code: 'EQUIP-001',
  category: 'equipment',
  title: 'Missing required physical specification',
  evaluate(ctx: ProjectValidationContext): ValidationFinding[] {
    const hits = ctx.equipment.filter((e) => {
      const p = ctx.catalog.get(e.productId);
      return p && !physicalSpecComplete(p);
    });
    if (!hits.length) {
      if (!ctx.equipment.length) return [];
      return [
        finding({
          id: 'EQUIP-001',
          code: 'EQUIP-001',
          severity: 'pass',
          category: 'equipment',
          title: 'Physical specification',
          message: 'Placed equipment has catalog width, height, and depth.',
          explanation: 'Geometry is taken from EquipmentProduct.physical — values are not invented.',
          source: 'Catalog physical.width/height/depth.'
        })
      ];
    }
    return hits.map((e) => {
      const p = ctx.catalog.get(e.productId)!;
      return finding({
        id: `EQUIP-001:${e.instanceId}`,
        code: 'EQUIP-001',
        severity: 'error',
        category: 'equipment',
        title: 'Missing required physical specification',
        message: `${p.manufacturer} ${p.model} is missing a usable width, height, or depth.`,
        explanation: '3D, Plan, and collision use catalog physical dimensions. Missing values are Not specified, not guessed.',
        objectId: e.instanceId,
        affectedObjects: [{ kind: 'equipment', id: e.instanceId, label: e.name }],
        recommendedActions: ['Replace with a catalog SKU that has published dimensions', 'Enter a user-defined catalog record with explicit sizes'],
        potentialVariables: ['Catalog physical specification'],
        source: 'EquipmentProduct.physical'
      });
    });
  }
};

export const checkEquipMounting: ValidationCheck = {
  code: 'EQUIP-002',
  category: 'equipment',
  title: 'Invalid mounting configuration',
  evaluate(ctx: ProjectValidationContext): ValidationFinding[] {
    if (!ctx.room) return [];
    const room = ctx.room;
    const hits: ValidationFinding[] = [];
    for (const e of ctx.equipment) {
      const p = ctx.catalog.get(e.productId);
      if (!p) continue;
      const kind = e.mountingKind ?? defaultMountingKind(p);
      let bad = '';
      if (exclusiveCeiling(p) && e.position.y < room.height - 0.45) {
        bad = 'Ceiling-only device is not at ceiling height.';
      } else if (exclusiveWall(p) && e.position.y < 0.2) {
        bad = 'Wall-mounted device is at floor height.';
      } else if (exclusiveWall(p) && distanceToNearestWall(room, e.position.x, e.position.z) > 0.55) {
        bad = 'Wall-mounted device is floating away from a wall.';
      } else if (exclusiveFloor(p) && e.position.y > 0.6) {
        bad = 'Floor-only device is not near the floor.';
      } else if (kind === 'rack' && !e.rackId) {
        bad = 'Rack-mountable device is not assigned to a rack.';
      }
      if (bad) {
        hits.push(
          finding({
            id: `EQUIP-002:${e.instanceId}`,
            code: 'EQUIP-002',
            severity: 'warning',
            category: 'equipment',
            title: 'Invalid mounting configuration',
            message: bad,
            explanation: 'Mounting comes from the catalog. Manual placement stays allowed; this check reports impossible combinations.',
            objectId: e.instanceId,
            affectedObjects: [{ kind: 'equipment', id: e.instanceId, label: e.name }],
            recommendedActions: ['Snap to a valid surface', 'Assign to a rack', 'Choose a product whose mounting matches the location'],
            potentialVariables: ['Position', 'Mounting kind', 'Rack assignment'],
            source: 'Catalog mounting + instance pose'
          })
        );
      }
    }
    if (hits.length) return hits;
    if (!ctx.equipment.length) return [];
    return [
      finding({
        id: 'EQUIP-002',
        code: 'EQUIP-002',
        severity: 'pass',
        category: 'equipment',
        title: 'Mounting',
        message: 'Placed equipment matches catalog mounting constraints.',
        explanation: 'Ceiling, wall, floor, table, and rack rules from the catalog.',
        source: 'Catalog mounting flags and instance Y/wall/rackId.'
      })
    ];
  }
};

export const checkEquipClearance: ValidationCheck = {
  code: 'EQUIP-003',
  category: 'equipment',
  title: 'Device intersects physical clearance',
  evaluate(ctx: ProjectValidationContext): ValidationFinding[] {
    if (!ctx.room) return [];
    const hits: ValidationFinding[] = [];
    for (const e of ctx.equipment) {
      const p = ctx.catalog.get(e.productId);
      if (!p || !physicalSpecComplete(p)) continue;
      const box = equipmentFootprint(p, e);
      for (const o of ctx.room.openings) {
        const ex = openingExclusionAabb(ctx.room, o.wall, o.offset, o.width);
        if (aabbsOverlap(box, ex, 0.02)) {
          hits.push(
            finding({
              id: `EQUIP-003:${e.instanceId}:${o.kind}`,
              code: 'EQUIP-003',
              severity: 'warning',
              category: 'equipment',
              title: 'Device intersects physical clearance',
              message: `${e.name} overlaps a ${o.kind} clearance zone.`,
              explanation: 'Opening keep-outs are the same exclusion volumes used by placement.',
              objectId: e.instanceId,
              affectedObjects: [{ kind: 'equipment', id: e.instanceId, label: e.name }],
              recommendedActions: ['Move the device', 'Use Snap to valid surface'],
              potentialVariables: ['Position'],
              source: 'Catalog footprint vs opening exclusion AABB'
            })
          );
        }
      }
      if (p.microphone?.mount !== 'table') {
        for (const t of ctx.tables) {
          if (aabbsOverlap(box, tableAabb(t), 0.04) && e.position.y < (t.height ?? 0.75) + 0.2) {
            hits.push(
              finding({
                id: `EQUIP-003:${e.instanceId}:${t.id}`,
                code: 'EQUIP-003',
                severity: 'warning',
                category: 'equipment',
                title: 'Device intersects physical clearance',
                message: `${e.name} intersects table ${t.id}.`,
                explanation: 'Non-table-mounted equipment should not occupy the tabletop footprint.',
                objectId: e.instanceId,
                affectedObjects: [{ kind: 'equipment', id: e.instanceId, label: e.name }],
                recommendedActions: ['Move the device off the table'],
                potentialVariables: ['Position'],
                source: 'Catalog footprint vs TableSpec AABB'
              })
            );
          }
        }
      }
    }
    if (hits.length) return hits;
    if (!ctx.equipment.length) return [];
    return [
      finding({
        id: 'EQUIP-003',
        code: 'EQUIP-003',
        severity: 'pass',
        category: 'equipment',
        title: 'Clearance',
        message: 'Equipment footprints stay clear of openings and tables.',
        explanation: 'Checked catalog physical AABB against furniture and openings.',
        source: 'equipmentFootprint vs opening/table AABB'
      })
    ];
  }
};

export const checkEquipGeometry: ValidationCheck = {
  code: 'EQUIP-004',
  category: 'equipment',
  title: 'Catalog/device geometry mismatch',
  evaluate(ctx: ProjectValidationContext): ValidationFinding[] {
    const hits = ctx.equipment.filter((e) => {
      const p = ctx.catalog.get(e.productId);
      return p && catalogGeometryMismatch(p);
    });
    if (!hits.length) {
      if (!ctx.equipment.length) return [];
      return [
        finding({
          id: 'EQUIP-004',
          code: 'EQUIP-004',
          severity: 'pass',
          category: 'equipment',
          title: 'Catalog geometry',
          message: 'Instance geometry matches catalog physical specification.',
          explanation: 'The renderer does not keep a second size. Diagonal vs listed WxH is checked when both exist.',
          source: 'EquipmentProduct.physical (and display diagonal when present)'
        })
      ];
    }
    return hits.map((e) => {
      const p = ctx.catalog.get(e.productId)!;
      return finding({
        id: `EQUIP-004:${e.instanceId}`,
        code: 'EQUIP-004',
        severity: 'warning',
        category: 'equipment',
        title: 'Catalog/device geometry mismatch',
        message: `${p.model} physical size is incomplete or inconsistent with listed diagonal.`,
        explanation: '3D/Plan use catalog dimensions only. Inconsistent records are flagged, not silently corrected.',
        objectId: e.instanceId,
        affectedObjects: [{ kind: 'equipment', id: e.instanceId, label: e.name }],
        recommendedActions: ['Correct the catalog record', 'Replace with a complete SKU'],
        potentialVariables: ['Catalog physical / diagonal'],
        source: 'physical vs display.diagonalInches'
      });
    });
  }
};

export const EQUIPMENT_CHECKS: ValidationCheck[] = [
  checkEquipPhysical,
  checkEquipMounting,
  checkEquipClearance,
  checkEquipGeometry
];
