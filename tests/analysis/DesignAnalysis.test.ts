import { describe, it, expect } from 'vitest';
import { getActiveDisplay, computeSeatStatuses, summarizeDesignHealth } from '../../src/av/DesignAnalysis';
import { EquipmentCatalog, type EquipmentInstance, type EquipmentProduct } from '../../src/catalog/EquipmentCatalog';
import type { Seat } from '../../src/room/SeatingGenerator';

const displayProduct: EquipmentProduct = {
  id: 'disp-86',
  manufacturer: 'Acme',
  model: 'AC-86',
  category: 'display',
  type: 'display',
  physical: { width: 1.9, height: 1.1, depth: 0.06 },
  display: { diagonalInches: 86, resolution: '4K', aspectRatio: '16:9', brightnessNits: 500 },
  provenance: 'estimated'
};

function catalogWith(products: EquipmentProduct[]): EquipmentCatalog {
  const c = new EquipmentCatalog();
  c.register(products);
  return c;
}

function seat(id: string, x: number, z: number): Seat {
  return { id, row: 1, indexInRow: 1, x, z, facing: 0, hasTable: false };
}

describe('DesignAnalysis', () => {
  it('getActiveDisplay returns null when no display is placed', () => {
    const catalog = catalogWith([displayProduct]);
    expect(getActiveDisplay([], catalog)).toBeNull();
  });

  it('getActiveDisplay builds DisplayPlacement from the first placed display instance', () => {
    const catalog = catalogWith([displayProduct]);
    const equipment: EquipmentInstance[] = [
      { instanceId: 'e1', productId: 'disp-86', name: 'Acme AC-86', position: { x: 0, y: 1.65, z: -3.5 }, rotationY: 0, wall: 'front' }
    ];
    const display = getActiveDisplay(equipment, catalog);
    expect(display).not.toBeNull();
    expect(display?.diagonalInches).toBe(86);
    expect(display?.wall).toBe('front');
  });

  it('computeSeatStatuses returns an empty map when there is no display', () => {
    const statuses = computeSeatStatuses([seat('R1-S1', 0, 2)], null);
    expect(statuses.size).toBe(0);
  });

  it('computeSeatStatuses and summarizeDesignHealth agree on pass/warning/fail counts', () => {
    const catalog = catalogWith([displayProduct]);
    const equipment: EquipmentInstance[] = [
      { instanceId: 'e1', productId: 'disp-86', name: 'Acme AC-86', position: { x: 0, y: 1.65, z: -3.5 }, rotationY: 0, wall: 'front' }
    ];
    const display = getActiveDisplay(equipment, catalog)!;
    const seats = [seat('near', 0, -1), seat('mid', 0, 2), seat('far', 6, 6)];

    const statuses = computeSeatStatuses(seats, display);
    const health = summarizeDesignHealth(seats, display);

    expect(statuses.size).toBe(3);
    const counts = { pass: 0, warning: 0, fail: 0 };
    statuses.forEach((s) => counts[s]++);
    expect(counts.pass).toBe(health.passCount);
    expect(counts.warning).toBe(health.warningCount);
    expect(counts.fail).toBe(health.failCount);
    expect(health.totalSeats).toBe(3);
  });
});
