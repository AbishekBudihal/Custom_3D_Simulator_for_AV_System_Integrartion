/**
 * Cable route validation. Length limits only when the project configures them.
 * Do not invent HDMI 15 m or Cat6 100 m defaults.
 */

import type { ProjectValidationContext } from './ValidationContext';
import type { ValidationCheck, ValidationFinding } from './ValidationTypes';
import { cachedCableRoute, type CableRouteContext } from '../../system/CableRouter';
import { resolveInstancePorts } from '../../system/PortResolver';
import { cableTypeOf } from '../../system/CableBoq';
import type { PhysicalMedium } from '../../system/SystemTypes';

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

function routeCtx(ctx: ProjectValidationContext): CableRouteContext {
  return {
    room: ctx.room,
    equipment: ctx.equipment,
    tables: ctx.tables,
    seats: ctx.seats,
    racks: ctx.racks,
    portOf: (instanceId, portId) => {
      const inst = ctx.equipment.find((e) => e.instanceId === instanceId);
      if (!inst) return undefined;
      return resolveInstancePorts(inst.instanceId, inst.productId, ctx.catalog).find((p) => p.id === portId);
    }
  };
}

export const checkCableRouteObstacle: ValidationCheck = {
  code: 'CABLE-001',
  category: 'system',
  title: 'Cable route obstacles',
  evaluate(ctx): ValidationFinding[] {
    if (!ctx.connections.length) return [];
    const rctx = routeCtx(ctx);
    const out: ValidationFinding[] = [];
    for (const c of ctx.connections) {
      const route = cachedCableRoute(c, rctx);
      if (route.status !== 'intersects-obstacle') continue;
      const src = ctx.equipment.find((e) => e.instanceId === c.fromInstanceId);
      const dst = ctx.equipment.find((e) => e.instanceId === c.toInstanceId);
      out.push(
        finding({
          id: `CABLE-001-${c.id}`,
          code: 'CABLE-001',
          severity: 'warning',
          category: 'system',
          title: 'Cable route intersects an obstacle',
          message: `${src?.name ?? c.fromInstanceId} → ${dst?.name ?? c.toInstanceId}: route still intersects ${route.intersectingObstacleIds.join(', ')}.`,
          explanation: 'Waypoint routing avoids furniture when possible. Remaining hits are geometric, not a BIM clash detection.',
          objectId: c.fromInstanceId,
          affectedObjects: [
            ...(src ? [{ kind: 'equipment' as const, id: src.instanceId, label: src.name }] : []),
            ...(dst ? [{ kind: 'equipment' as const, id: dst.instanceId, label: dst.name }] : [])
          ],
          recommendedActions: ['Move the device or furniture', 'Review the highlighted route in System → Room routes'],
          source: 'CableRouter'
        })
      );
    }
    return out;
  }
};

export const checkCableLengthLimit: ValidationCheck = {
  code: 'CABLE-002',
  category: 'system',
  title: 'Cable length',
  evaluate(ctx): ValidationFinding[] {
    if (!ctx.connections.length) return [];
    const limits = ctx.cableLengthLimitsM ?? {};
    const rctx = routeCtx(ctx);
    const out: ValidationFinding[] = [];
    for (const c of ctx.connections) {
      const route = cachedCableRoute(c, rctx);
      const type = cableTypeOf(c);
      const limit = limits[type];
      const src = ctx.equipment.find((e) => e.instanceId === c.fromInstanceId);
      const dst = ctx.equipment.find((e) => e.instanceId === c.toInstanceId);
      if (limit == null) continue;
      if (route.totalLength > limit) {
        out.push(
          finding({
            id: `CABLE-002-${c.id}`,
            code: 'CABLE-002',
            severity: 'warning',
            category: 'system',
            title: 'Cable length exceeds configured limit',
            message: `${type} run ${route.totalLength.toFixed(2)} m exceeds the project limit of ${limit} m.`,
            explanation: 'Limit is a project setting, not a claimed industry standard.',
            metric: { name: 'Route length', actual: `${route.totalLength.toFixed(2)} m`, expected: `≤ ${limit} m` },
            objectId: c.fromInstanceId,
            affectedObjects: [
              ...(src ? [{ kind: 'equipment' as const, id: src.instanceId, label: src.name }] : []),
              ...(dst ? [{ kind: 'equipment' as const, id: dst.instanceId, label: dst.name }] : [])
            ],
            recommendedActions: ['Shorten the route', 'Raise the configured limit if it is intentional'],
            source: 'CableRouter + project.cableLengthLimitsM'
          })
        );
      }
    }
    return out;
  }
};

export function lengthLimitFor(limits: Partial<Record<PhysicalMedium, number>> | undefined, medium: PhysicalMedium): number | undefined {
  return limits?.[medium];
}

export const CABLE_CHECKS: ValidationCheck[] = [checkCableRouteObstacle, checkCableLengthLimit];
