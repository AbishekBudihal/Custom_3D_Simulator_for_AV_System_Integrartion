/**
 * Obstacle-aware cable routes. Geometric estimate only — not BIM trays.
 * Length is the polyline, never a single Euclidean hop through furniture.
 */

import type { EquipmentInstance } from '../catalog/EquipmentCatalog';
import type { RoomModel } from '../room/RoomModel';
import type { Seat, TableSpec } from '../room/SeatingGenerator';
import type { AVRack } from '../av/AVRack';
import { rackFootprint, RU_HEIGHT_M } from '../av/AVRack';
import type { PortDefinition } from './SystemTypes';
import type { CableRoute, CableSegment, SystemConnection } from './SystemTypes';

export interface RouteObstacleBox {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topHeightM: number;
}

export interface CableRouteContext {
  room: RoomModel | null;
  equipment: EquipmentInstance[];
  tables: TableSpec[];
  seats: Seat[];
  racks: AVRack[];
  portOf: (instanceId: string, portId: string) => PortDefinition | undefined;
}

function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function seg(start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }): CableSegment {
  return { start, end, length: dist(start, end) };
}

export function portWorldPosition(
  inst: EquipmentInstance,
  port: PortDefinition | undefined,
  racks: AVRack[]
): { x: number; y: number; z: number } {
  const rack = inst.rackId ? racks.find((r) => r.id === inst.rackId) : undefined;
  if (rack) {
    const ru = inst.rackPositionRU ?? 1;
    const y =
      rack.kind === 'floor'
        ? (ru - 1) * RU_HEIGHT_M + 0.12
        : rack.y - rack.height / 2 + (ru - 1) * RU_HEIGHT_M;
    const out = !port || port.direction === 'output' || port.direction === 'bidirectional';
    const along = out ? rack.depth * 0.42 : -rack.depth * 0.42;
    const fx = Math.sin(rack.rotationY);
    const fz = Math.cos(rack.rotationY);
    return {
      x: rack.x + fx * along,
      y,
      z: rack.z + fz * along
    };
  }
  const dir = port?.direction === 'output' ? 1 : port?.direction === 'input' ? -1 : 0.35;
  const fx = Math.sin(inst.rotationY);
  const fz = Math.cos(inst.rotationY);
  return {
    x: inst.position.x + fx * 0.07 * dir,
    y: inst.position.y,
    z: inst.position.z + fz * 0.07 * dir
  };
}

export function routingObstacles(
  room: RoomModel | null,
  tables: TableSpec[],
  seats: Seat[],
  racks: AVRack[],
  skipRackIds: Set<string>
): RouteObstacleBox[] {
  const boxes: RouteObstacleBox[] = [];
  tables.forEach((t) => {
    boxes.push({
      id: `table:${t.id}`,
      minX: t.centerX - t.sizeX / 2,
      maxX: t.centerX + t.sizeX / 2,
      minZ: t.centerZ - t.sizeZ / 2,
      maxZ: t.centerZ + t.sizeZ / 2,
      topHeightM: t.height ?? 0.75
    });
  });
  seats.forEach((s) => {
    boxes.push({
      id: `seat:${s.id}`,
      minX: s.x - 0.28,
      maxX: s.x + 0.28,
      minZ: s.z - 0.28,
      maxZ: s.z + 0.28,
      topHeightM: 1.05
    });
  });
  racks.forEach((r) => {
    if (skipRackIds.has(r.id)) return;
    const f = rackFootprint(r);
    boxes.push({
      id: `rack:${r.id}`,
      minX: f.minX,
      maxX: f.maxX,
      minZ: f.minZ,
      maxZ: f.maxZ,
      topHeightM: r.kind === 'wall' ? r.y + r.height / 2 : r.height
    });
  });
  if (room) {
    room.columns.forEach((c, i) => {
      boxes.push({
        id: `column:${i}`,
        minX: c.x - c.width / 2,
        maxX: c.x + c.width / 2,
        minZ: c.z - c.depth / 2,
        maxZ: c.z + c.depth / 2,
        topHeightM: room.height
      });
    });
  }
  return boxes;
}

/** 2D segment vs AABB (inclusive). */
export function xzSegmentHitsBox(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  box: RouteObstacleBox,
  pad = 0.02
): boolean {
  const minX = box.minX - pad;
  const maxX = box.maxX + pad;
  const minZ = box.minZ - pad;
  const maxZ = box.maxZ + pad;
  const samples = 12;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return true;
  }
  return false;
}

export function segmentHitsObstacles(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  boxes: RouteObstacleBox[]
): string[] {
  const yMin = Math.min(a.y, b.y);
  const hits: string[] = [];
  for (const box of boxes) {
    if (yMin >= box.topHeightM - 0.02) continue;
    if (xzSegmentHitsBox(a.x, a.z, b.x, b.z, box)) hits.push(box.id);
  }
  return hits;
}

function pointInBox(x: number, z: number, box: RouteObstacleBox, pad = 0): boolean {
  return x >= box.minX - pad && x <= box.maxX + pad && z >= box.minZ - pad && z <= box.maxZ + pad;
}

function liftPoint(
  p: { x: number; y: number; z: number },
  boxes: RouteObstacleBox[],
  ceilingY: number,
  room: RoomModel | null
): { x: number; y: number; z: number }[] {
  const containing = boxes.find((b) => p.y < b.topHeightM - 0.02 && pointInBox(p.x, p.z, b));
  if (!containing) return [p, { x: p.x, y: ceilingY, z: p.z }];
  const edge = aroundBox({ x: p.x, z: p.z }, { x: p.x, z: p.z }, containing, room);
  return [p, { x: edge.x, y: p.y, z: edge.z }, { x: edge.x, y: ceilingY, z: edge.z }];
}

function clampToRoom(room: RoomModel | null, x: number, z: number): { x: number; z: number } {
  if (!room) return { x, z };
  const m = 0.12;
  return {
    x: Math.max(-room.width / 2 + m, Math.min(room.width / 2 - m, x)),
    z: Math.max(-room.depth / 2 + m, Math.min(room.depth / 2 - m, z))
  };
}

function aroundBox(
  from: { x: number; z: number },
  to: { x: number; z: number },
  box: RouteObstacleBox,
  room: RoomModel | null
): { x: number; z: number } {
  const pad = 0.18;
  const corners = [
    { x: box.minX - pad, z: box.minZ - pad },
    { x: box.maxX + pad, z: box.minZ - pad },
    { x: box.minX - pad, z: box.maxZ + pad },
    { x: box.maxX + pad, z: box.maxZ + pad }
  ].map((c) => clampToRoom(room, c.x, c.z));
  let best = corners[0];
  let bestD = Infinity;
  corners.forEach((c) => {
    const d = Math.hypot(c.x - from.x, c.z - from.z) + Math.hypot(c.x - to.x, c.z - to.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  });
  return best;
}

function horizontalClearPath(
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  boxes: RouteObstacleBox[],
  room: RoomModel | null
): { x: number; y: number; z: number }[] {
  const y = start.y;
  const directHits = segmentHitsObstacles(start, end, boxes);
  if (!directHits.length) return [start, end];
  const box = boxes.find((b) => b.id === directHits[0]);
  if (!box) return [start, end];
  const wp = aroundBox({ x: start.x, z: start.z }, { x: end.x, z: end.z }, box, room);
  const mid = { x: wp.x, y, z: wp.z };
  const viaX = { x: end.x, y, z: start.z };
  const viaZ = { x: start.x, y, z: end.z };
  const manhattanA = [start, viaX, end];
  const manhattanB = [start, viaZ, end];
  const corner = [start, mid, end];
  const score = (pts: { x: number; y: number; z: number }[]) => {
    let hits = 0;
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      hits += segmentHitsObstacles(pts[i], pts[i + 1], boxes).length;
      len += dist(pts[i], pts[i + 1]);
    }
    return hits * 1000 + len;
  };
  return [manhattanA, manhattanB, corner].sort((a, b) => score(a) - score(b))[0];
}

export function routeForConnection(connection: SystemConnection, ctx: CableRouteContext): CableRoute {
  const fromEq = ctx.equipment.find((e) => e.instanceId === connection.fromInstanceId);
  const toEq = ctx.equipment.find((e) => e.instanceId === connection.toInstanceId);
  if (!fromEq || !toEq) {
    return {
      connectionId: connection.id,
      segments: [],
      totalLength: 0,
      pathType: 'direct',
      status: 'no-room',
      intersectingObstacleIds: []
    };
  }
  const fromPort = ctx.portOf(fromEq.instanceId, connection.fromPortId);
  const toPort = ctx.portOf(toEq.instanceId, connection.toPortId);
  const start = portWorldPosition(fromEq, fromPort, ctx.racks);
  const end = portWorldPosition(toEq, toPort, ctx.racks);
  const skip = new Set<string>();
  if (fromEq.rackId) skip.add(fromEq.rackId);
  if (toEq.rackId) skip.add(toEq.rackId);
  const boxes = routingObstacles(ctx.room, ctx.tables, ctx.seats, ctx.racks, skip);

  if (fromEq.rackId && fromEq.rackId === toEq.rackId) {
    const mid = { x: start.x, y: Math.max(start.y, end.y) + 0.04, z: start.z };
    const segments = [seg(start, mid), seg(mid, { ...end, y: mid.y }), seg({ ...end, y: mid.y }, end)];
    return finishRoute(connection.id, segments, 'rack-internal', boxes, ctx.room);
  }

  if (!ctx.room) {
    const mid = { x: (start.x + end.x) / 2, y: Math.max(start.y, end.y), z: (start.z + end.z) / 2 };
    return finishRoute(connection.id, [seg(start, mid), seg(mid, end)], 'direct', boxes, null);
  }

  const ceilingY = Math.max(start.y, end.y, ctx.room.height - 0.18);
  const startLift = liftPoint(start, boxes, ceilingY, ctx.room);
  const endLift = liftPoint(end, boxes, ceilingY, ctx.room);
  const horiz = horizontalClearPath(startLift[startLift.length - 1], endLift[endLift.length - 1], boxes, ctx.room);
  const points = [...startLift.slice(0, -1), ...horiz, ...endLift.slice(0, -1).reverse(), end];
  const segments: CableSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    if (dist(points[i], points[i + 1]) < 1e-6) continue;
    segments.push(seg(points[i], points[i + 1]));
  }
  return finishRoute(connection.id, segments, 'ceiling', boxes, ctx.room);
}

function finishRoute(
  connectionId: string,
  segments: CableSegment[],
  pathType: CableRoute['pathType'],
  boxes: RouteObstacleBox[],
  room: RoomModel | null
): CableRoute {
  const intersectingObstacleIds = [
    ...new Set(segments.flatMap((s) => segmentHitsObstacles(s.start, s.end, boxes)))
  ];
  const totalLength = Number(segments.reduce((a, s) => a + s.length, 0).toFixed(3));
  const status: CableRoute['status'] = !room ? 'no-room' : intersectingObstacleIds.length ? 'intersects-obstacle' : 'clear';
  return { connectionId, segments, totalLength, pathType, status, intersectingObstacleIds };
}

export function routeLength(route: CableRoute): number {
  return route.totalLength;
}

const routeMemo = new Map<string, { key: string; route: CableRoute }>();

export function routeCacheKey(connection: SystemConnection, ctx: CableRouteContext): string {
  const from = ctx.equipment.find((e) => e.instanceId === connection.fromInstanceId);
  const to = ctx.equipment.find((e) => e.instanceId === connection.toInstanceId);
  return JSON.stringify({
    id: connection.id,
    from: from ? { p: from.position, r: from.rotationY, rack: from.rackId, ru: from.rackPositionRU } : null,
    to: to ? { p: to.position, r: to.rotationY, rack: to.rackId, ru: to.rackPositionRU } : null,
    room: ctx.room ? { w: ctx.room.width, d: ctx.room.depth, h: ctx.room.height } : null,
    tables: ctx.tables.map((t) => [t.id, t.centerX, t.centerZ, t.sizeX, t.sizeZ, t.height]),
    racks: ctx.racks.map((r) => [r.id, r.x, r.z, r.height, r.rotationY])
  });
}

export function cachedCableRoute(connection: SystemConnection, ctx: CableRouteContext): CableRoute {
  const key = routeCacheKey(connection, ctx);
  const hit = routeMemo.get(connection.id);
  if (hit?.key === key) return hit.route;
  const route = routeForConnection(connection, ctx);
  routeMemo.set(connection.id, { key, route });
  return route;
}

export function invalidateCableRoutes(connectionIds?: string[]): void {
  if (!connectionIds) {
    routeMemo.clear();
    return;
  }
  connectionIds.forEach((id) => routeMemo.delete(id));
}

export function connectionsTouching(connections: SystemConnection[], instanceId: string): string[] {
  return connections.filter((c) => c.fromInstanceId === instanceId || c.toInstanceId === instanceId).map((c) => c.id);
}
