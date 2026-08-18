/**
 * Catalog identity, search, mounting, and footprint helpers.
 * Catalog specs stay authoritative — instances do not copy dimensions.
 */

import type { EquipmentCategory, EquipmentInstance, EquipmentProduct } from './EquipmentCatalog';
import { CATEGORY_GROUPS } from './EquipmentCatalog';
import { NOT_SPECIFIED } from './CatalogPresentation';
import type { Aabb } from '../room/FurnitureGeometry';

export type MountingKind = 'wall' | 'ceiling' | 'floor' | 'table' | 'rack' | 'freestanding';

export function productFamily(product: EquipmentProduct): string {
  return product.family?.trim() || product.type.replace(/_/g, ' ') || NOT_SPECIFIED;
}

export function productDescription(product: EquipmentProduct): string {
  return product.description?.trim() || NOT_SPECIFIED;
}

export function productSearchHaystack(product: EquipmentProduct): string {
  return [
    product.id,
    product.manufacturer,
    product.model,
    product.category,
    product.type,
    product.family,
    product.description
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function filterCatalog(
  products: EquipmentProduct[],
  query: { groupId?: string; category?: EquipmentCategory; manufacturer?: string; text?: string; model?: string }
): EquipmentProduct[] {
  const group = query.groupId ? CATEGORY_GROUPS.find((g) => g.id === query.groupId) : undefined;
  const q = query.text?.trim().toLowerCase() ?? '';
  const modelQ = query.model?.trim().toLowerCase() ?? '';
  return products.filter((p) => {
    if (group && !group.categories.includes(p.category)) return false;
    if (query.category && p.category !== query.category) return false;
    if (query.manufacturer && p.manufacturer !== query.manufacturer) return false;
    if (modelQ && !p.model.toLowerCase().includes(modelQ)) return false;
    if (q && !productSearchHaystack(p).includes(q)) return false;
    return true;
  });
}

export function physicalSpecComplete(product: EquipmentProduct): boolean {
  const p = product.physical;
  return !!(p && p.width > 0 && p.height > 0 && p.depth > 0);
}

export function catalogMountKinds(product: EquipmentProduct): MountingKind[] {
  const kinds = new Set<MountingKind>();
  if (product.speaker?.mount === 'ceiling' || product.speaker?.mount === 'pendant') kinds.add('ceiling');
  if (product.speaker?.mount === 'wall') kinds.add('wall');
  if (product.camera?.mount) kinds.add(product.camera.mount === 'table' ? 'table' : product.camera.mount);
  if (product.microphone?.mount === 'ceiling') kinds.add('ceiling');
  if (product.microphone?.mount === 'table') kinds.add('table');
  if (product.microphone?.mount === 'wall') kinds.add('wall');
  if (product.mounting?.wall) kinds.add('wall');
  if (product.mounting?.ceiling) kinds.add('ceiling');
  if (product.mounting?.floor) kinds.add('floor');
  if (product.mounting?.table) kinds.add('table');
  if (product.mounting?.rack) kinds.add('rack');
  if (product.mounting?.freestanding) kinds.add('freestanding');
  if (product.category === 'display') kinds.add('wall');
  if (product.rackUnits != null && product.rackUnits > 0) kinds.add('rack');
  if (!kinds.size) kinds.add('freestanding');
  return Array.from(kinds);
}

export function defaultMountingKind(product: EquipmentProduct): MountingKind {
  const kinds = catalogMountKinds(product);
  if (kinds.includes('ceiling') && kinds.length === 1) return 'ceiling';
  if (kinds.includes('wall') && product.category === 'display') return 'wall';
  if (kinds.includes('table') && product.microphone?.mount === 'table') return 'table';
  if (kinds.includes('rack') && !kinds.includes('wall') && !kinds.includes('ceiling')) return 'rack';
  return kinds[0];
}

export function analysisSupportLine(product: EquipmentProduct): string {
  switch (product.category) {
    case 'display':
      return product.display && product.physical.width > 0 && product.physical.height > 0
        ? 'Viewing model: Supported'
        : 'Viewing model: Not specified — display size incomplete';
    case 'camera':
      return product.camera?.horizontalFovDeg
        ? `FOV coverage: geometric frustum (HFOV ${product.camera.horizontalFovDeg}°${product.camera.verticalFovDeg != null ? `; VFOV ${product.camera.verticalFovDeg}°` : '; VFOV not specified'})`
        : 'FOV coverage: Not specified — HFOV required';
    case 'speaker':
      return 'Coverage: geometric estimate — not acoustic prediction';
    case 'microphone':
      return 'Pickup: geometric estimate — not acoustic prediction';
    default:
      return 'No spatial coverage model for this category';
  }
}

export const CATALOG_READONLY_FIELDS = [
  'manufacturer',
  'model',
  'category',
  'physical.width',
  'physical.height',
  'physical.depth',
  'physical.weightKg',
  'display.diagonalInches',
  'display.resolution',
  'display.aspectRatio',
  'camera.horizontalFovDeg',
  'camera.verticalFovDeg',
  'speaker.dispersionDeg',
  'microphone.pickupRadiusM',
  'mounting.catalog'
] as const;

export const PROJECT_EDITABLE_FIELDS = [
  'name',
  'position.x',
  'position.y',
  'position.z',
  'rotationY',
  'mountingKind',
  'rackId',
  'rackPositionRU',
  'rackUnits'
] as const;

export function isCatalogReadonlyField(key: string): boolean {
  return (CATALOG_READONLY_FIELDS as readonly string[]).includes(key);
}

export function isProjectEditableField(key: string): boolean {
  return (PROJECT_EDITABLE_FIELDS as readonly string[]).includes(key);
}

/** Axis-aligned footprint from catalog physical size at the instance pose. */
export function equipmentFootprint(product: EquipmentProduct, inst: EquipmentInstance): Aabb {
  const w = product.physical.width || 0.05;
  const d = product.physical.depth || 0.05;
  const hx = w / 2;
  const hz = d / 2;
  return {
    minX: inst.position.x - hx,
    maxX: inst.position.x + hx,
    minZ: inst.position.z - hz,
    maxZ: inst.position.z + hz
  };
}

export function distanceToNearestWall(room: { width: number; depth: number }, x: number, z: number): number {
  const hw = room.width / 2;
  const hd = room.depth / 2;
  return Math.min(Math.abs(x + hw), Math.abs(x - hw), Math.abs(z + hd), Math.abs(z - hd));
}

export function catalogGeometryMismatch(product: EquipmentProduct): boolean {
  if (!physicalSpecComplete(product)) return true;
  if (product.display) {
    const diagM = product.display.diagonalInches * 0.0254;
    const listed = Math.hypot(product.physical.width, product.physical.height);
    if (diagM > 0.2 && Math.abs(listed - diagM) / diagM > 0.35) return true;
  }
  return false;
}
