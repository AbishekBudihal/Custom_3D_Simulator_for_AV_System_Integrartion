/**
 * Plan CAD helpers. View/annotation only — not project furniture objects.
 */

export interface CadPoint {
  x: number;
  z: number;
  kind: 'grid' | 'center' | 'object-center' | 'edge' | 'midpoint' | 'wall';
}

export interface AlignmentGuide {
  axis: 'x' | 'z';
  value: number;
}

export function distanceM(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function snapToGrid(x: number, z: number, gridM: number): { x: number; z: number } {
  const g = gridM > 0 ? gridM : 0.05;
  return {
    x: Math.round(x / g) * g,
    z: Math.round(z / g) * g
  };
}

export function nearestCadSnap(
  x: number,
  z: number,
  targets: CadPoint[],
  gridM: number,
  thresholdM = 0.12
): { x: number; z: number; kind: CadPoint['kind'] } {
  let best = { x, z, kind: 'grid' as CadPoint['kind'], d: thresholdM };
  for (const t of targets) {
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < best.d) best = { x: t.x, z: t.z, kind: t.kind, d };
  }
  if (best.d < thresholdM && best.kind !== 'grid') {
    return { x: Number(best.x.toFixed(3)), z: Number(best.z.toFixed(3)), kind: best.kind };
  }
  const g = snapToGrid(x, z, gridM);
  return { x: Number(g.x.toFixed(3)), z: Number(g.z.toFixed(3)), kind: 'grid' };
}

export function alignmentGuides(
  moving: { x: number; z: number },
  others: Array<{ x: number; z: number }>,
  thresholdM = 0.08
): AlignmentGuide[] {
  const out: AlignmentGuide[] = [];
  for (const o of others) {
    if (Math.abs(o.x - moving.x) < thresholdM) out.push({ axis: 'x', value: o.x });
    if (Math.abs(o.z - moving.z) < thresholdM) out.push({ axis: 'z', value: o.z });
  }
  return out;
}

export function roomCadTargets(room: { width: number; depth: number }): CadPoint[] {
  const hw = room.width / 2;
  const hd = room.depth / 2;
  return [
    { x: 0, z: 0, kind: 'center' },
    { x: 0, z: -hd, kind: 'wall' },
    { x: 0, z: hd, kind: 'wall' },
    { x: -hw, z: 0, kind: 'wall' },
    { x: hw, z: 0, kind: 'wall' },
    { x: 0, z: -hd, kind: 'midpoint' },
    { x: 0, z: hd, kind: 'midpoint' },
    { x: -hw, z: 0, kind: 'midpoint' },
    { x: hw, z: 0, kind: 'midpoint' }
  ];
}

export function boxCadTargets(cx: number, cz: number, sizeX: number, sizeZ: number): CadPoint[] {
  const hx = sizeX / 2;
  const hz = sizeZ / 2;
  return [
    { x: cx, z: cz, kind: 'object-center' },
    { x: cx - hx, z: cz, kind: 'edge' },
    { x: cx + hx, z: cz, kind: 'edge' },
    { x: cx, z: cz - hz, kind: 'edge' },
    { x: cx, z: cz + hz, kind: 'edge' },
    { x: cx - hx, z: cz - hz, kind: 'edge' },
    { x: cx + hx, z: cz - hz, kind: 'edge' },
    { x: cx - hx, z: cz + hz, kind: 'edge' },
    { x: cx + hx, z: cz + hz, kind: 'edge' }
  ];
}
