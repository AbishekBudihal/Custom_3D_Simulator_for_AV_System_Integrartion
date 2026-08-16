import * as THREE from 'three';
import type { CableRoute } from '../system/SystemTypes';
import type { SignalType } from '../system/SystemTypes';

const SIG_COLOR: Record<string, number> = {
  VIDEO: 0x6aa4e8,
  AUDIO: 0x6aae7a,
  USB: 0xc4a35a,
  NETWORK: 0x5aa88a,
  CONTROL: 0xa8a8a8,
  POWER: 0xb07a4a
};

function bundleOffset(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * 0.045;
}

export function addCableRouteOverlays(
  group: THREE.Group,
  routes: Array<{ route: CableRoute; signalType: SignalType; selected: boolean }>,
  showAll: boolean
): void {
  const visible = routes.filter((r) => showAll || r.selected);
  const keys = visible.map((r) => ceilingKey(r.route));
  visible.forEach((item, i) => {
    const siblings = visible.filter((_, j) => keys[j] === keys[i]);
    const idx = siblings.findIndex((s) => s.route.connectionId === item.route.connectionId);
    const off = bundleOffset(idx, siblings.length);
    addOneRoute(group, item.route, item.signalType, item.selected, off);
  });
}

function ceilingKey(route: CableRoute): string {
  const horiz = route.segments.filter((s) => Math.abs(s.start.y - s.end.y) < 0.08);
  if (!horiz.length) return route.connectionId;
  const a = horiz[0].start;
  const b = horiz[horiz.length - 1].end;
  return `${a.x.toFixed(1)},${a.z.toFixed(1)}-${b.x.toFixed(1)},${b.z.toFixed(1)}`;
}

function addOneRoute(
  group: THREE.Group,
  route: CableRoute,
  signalType: SignalType,
  selected: boolean,
  offset: number
): void {
  const color = SIG_COLOR[signalType] ?? 0x8a9098;
  const pts = route.segments.flatMap((s, i) => {
    const a = new THREE.Vector3(s.start.x + offset, s.start.y, s.start.z + offset * 0.2);
    const b = new THREE.Vector3(s.end.x + offset, s.end.y, s.end.z + offset * 0.2);
    return i === 0 ? [a, b] : [b];
  });
  if (pts.length < 2) return;
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: selected ? 0.95 : 0.55,
      depthWrite: false
    })
  );
  line.userData.connectionId = route.connectionId;
  group.add(line);
}
