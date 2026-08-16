/**
 * AlignEngine.ts
 * Plan-view alignment / distribution on world XZ using object positions.
 * Not screen pixels. Does not change Y, snap rules, or seating generation.
 */

export interface Alignable {
  id: string;
  x: number;
  z: number;
}

export type AlignCommand =
  | 'left'
  | 'centerX'
  | 'right'
  | 'front'
  | 'middleZ'
  | 'back'
  | 'distributeX'
  | 'distributeZ';

export function applyAlignCommand(items: Alignable[], command: AlignCommand): Alignable[] {
  if (items.length < 2) return items.map((i) => ({ ...i }));
  if (command === 'distributeX' || command === 'distributeZ') return distribute(items, command === 'distributeX' ? 'x' : 'z');
  const axis = command === 'left' || command === 'centerX' || command === 'right' ? 'x' : 'z';
  const values = items.map((i) => i[axis]);
  let target = 0;
  if (command === 'left' || command === 'front') target = Math.min(...values);
  else if (command === 'right' || command === 'back') target = Math.max(...values);
  else target = values.reduce((a, b) => a + b, 0) / values.length;
  return items.map((i) => ({ ...i, [axis]: Number(target.toFixed(3)) }));
}

function distribute(items: Alignable[], axis: 'x' | 'z'): Alignable[] {
  const sorted = [...items].sort((a, b) => a[axis] - b[axis]);
  const first = sorted[0][axis];
  const last = sorted[sorted.length - 1][axis];
  if (sorted.length < 3 || last === first) return items.map((i) => ({ ...i }));
  const step = (last - first) / (sorted.length - 1);
  return sorted.map((item, i) => ({
    ...item,
    [axis]: Number((first + step * i).toFixed(3))
  }));
}
