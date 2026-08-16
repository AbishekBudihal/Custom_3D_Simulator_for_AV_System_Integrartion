/**
 * SystemLayout.ts
 * Diagram coordinates only. Never writes equipment.position.
 */

import type { EquipmentCatalog } from '../catalog/EquipmentCatalog';

export const NODE_W = 220;

export function nodeHeight(portRows: number): number {
  return 56 + Math.max(1, portRows) * 18;
}

export function orthoPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = Math.round((x1 + x2) / 2);
  return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
}

const COLUMNS: string[][] = [
  ['source'],
  ['camera', 'microphone'],
  ['switcher'],
  ['dsp'],
  ['extender', 'amplifier', 'network'],
  ['display', 'speaker', 'control']
];

export function computeAutoLayout(
  equipment: Array<{ instanceId: string; productId: string }>,
  catalog: EquipmentCatalog
): Record<string, { x: number; y: number }> {
  const layout: Record<string, { x: number; y: number }> = {};
  const placed = new Set<string>();
  let col = 0;
  COLUMNS.forEach((cats) => {
    const ids = equipment.filter((e) => {
      const cat = catalog.get(e.productId)?.category ?? '';
      return cats.includes(cat);
    });
    if (!ids.length) return;
    ids.forEach((e, row) => {
      layout[e.instanceId] = { x: 32 + col * 260, y: 28 + row * 150 };
      placed.add(e.instanceId);
    });
    col += 1;
  });
  equipment.forEach((e, i) => {
    if (placed.has(e.instanceId)) return;
    layout[e.instanceId] = { x: 32 + col * 260, y: 28 + i * 40 };
  });
  return layout;
}
