/**
 * Catalog filtering for Auto Design. Missing engineering fields are
 * DATA INCOMPLETE — never filled with generic 60° / 90° / SPL values.
 */

import type { EquipmentCatalog, EquipmentProduct } from '../catalog/EquipmentCatalog';
import { resolveProductPorts } from '../system/PortResolver';
import type { DesignRequirements } from './DesignRequirements';

export type DataCompleteness = 'complete' | 'partial' | 'incomplete';

export interface CandidateFilterResult {
  usable: EquipmentProduct[];
  incomplete: Array<{ product: EquipmentProduct; reason: string }>;
  completeness: DataCompleteness;
  completenessReason: string;
}

export function displayEngineeringReady(p: EquipmentProduct): string | null {
  if (p.category !== 'display') return 'Not a display.';
  if (!p.display || !(p.display.diagonalInches > 0)) return 'DATA INCOMPLETE — catalog display size is missing.';
  if (!(p.physical.width > 0) || !(p.physical.height > 0)) {
    return 'DATA INCOMPLETE — catalog physical width/height required for viewing analysis.';
  }
  return null;
}

export function micEngineeringReady(p: EquipmentProduct): string | null {
  if (p.category !== 'microphone') return 'Not a microphone.';
  const spec = p.microphone;
  if (!spec || spec.pickupRadiusM == null || !(spec.pickupRadiusM > 0)) {
    return 'DATA INCOMPLETE — microphone pickupRadiusM is missing.';
  }
  if (spec.coverageModel === 'directional_sector' || spec.beamWidthDeg != null) {
    if (spec.beamWidthDeg == null || !(spec.beamWidthDeg > 0)) {
      return 'DATA INCOMPLETE — directional microphone beamWidthDeg is missing.';
    }
  }
  return null;
}

export function speakerEngineeringReady(p: EquipmentProduct): string | null {
  if (p.category !== 'speaker') return 'Not a speaker.';
  const spec = p.speaker;
  if (!spec) return 'DATA INCOMPLETE — speaker specification block is missing.';
  if (spec.maxSplAt1m == null || !(spec.maxSplAt1m > 0)) {
    return 'DATA INCOMPLETE — speaker maxSplAt1m is missing.';
  }
  const hasNom = spec.dispersionDeg != null && spec.dispersionDeg > 0;
  const hasHV =
    spec.horizontalDispersionDeg != null &&
    spec.horizontalDispersionDeg > 0 &&
    spec.verticalDispersionDeg != null &&
    spec.verticalDispersionDeg > 0;
  if (!hasNom && !hasHV) {
    return 'DATA INCOMPLETE — speaker dispersion is missing.';
  }
  return null;
}

export function cameraEngineeringReady(p: EquipmentProduct): string | null {
  if (p.category !== 'camera') return 'Not a camera.';
  const hfov = p.camera?.horizontalFovDeg;
  if (hfov == null || !(hfov > 0)) {
    return 'DATA INCOMPLETE — camera horizontalFovDeg is missing.';
  }
  return null;
}

export function cameraCompleteness(p: EquipmentProduct): { status: DataCompleteness; reason: string } {
  const miss = cameraEngineeringReady(p);
  if (miss) return { status: 'incomplete', reason: miss };
  if (p.camera?.verticalFovDeg == null || !(p.camera.verticalFovDeg > 0)) {
    return { status: 'partial', reason: 'HFOV available. VFOV unavailable (not invented).' };
  }
  return { status: 'complete', reason: 'Catalog HFOV and VFOV available.' };
}

export function speakerCompleteness(p: EquipmentProduct): { status: DataCompleteness; reason: string } {
  const miss = speakerEngineeringReady(p);
  if (miss) return { status: 'incomplete', reason: miss };
  return { status: 'complete', reason: 'SPL + dispersion available.' };
}

export function systemDeviceConnectable(p: EquipmentProduct): string | null {
  const { ports, incomplete } = resolveProductPorts(p);
  if (incomplete || ports.length === 0) {
    return 'DATA INCOMPLETE — catalog has no ports; a signal path cannot be created.';
  }
  return null;
}

function applyManufacturerPref(
  products: EquipmentProduct[],
  req: DesignRequirements
): { preferred: EquipmentProduct[]; others: EquipmentProduct[] } {
  const names = req.preferences.manufacturers.map((m) => m.toLowerCase());
  if (!names.length) return { preferred: products, others: [] };
  const preferred = products.filter((p) => names.includes(p.manufacturer.toLowerCase()));
  const others = products.filter((p) => !names.includes(p.manufacturer.toLowerCase()));
  return { preferred, others };
}

export function filterCategory(
  catalog: EquipmentCatalog,
  category: EquipmentProduct['category'],
  ready: (p: EquipmentProduct) => string | null,
  req: DesignRequirements
): CandidateFilterResult {
  const all = catalog.byCategory(category);
  const incomplete: CandidateFilterResult['incomplete'] = [];
  const readyProducts: EquipmentProduct[] = [];
  for (const p of all) {
    const miss = ready(p);
    if (miss) incomplete.push({ product: p, reason: miss });
    else readyProducts.push(p);
  }

  const { preferred, others } = applyManufacturerPref(readyProducts, req);
  const exclusive = req.constraints.manufacturersExclusive && req.preferences.manufacturers.length > 0;
  const usable = exclusive ? preferred : preferred.length ? preferred : readyProducts;

  let completeness: DataCompleteness = 'incomplete';
  let completenessReason = 'No catalog products in this category have the required engineering fields.';
  if (usable.length) {
    completeness = 'complete';
    completenessReason = `${usable.length} catalog product(s) have the fields required by the existing engine.`;
    if (!exclusive && preferred.length === 0 && req.preferences.manufacturers.length) {
      completeness = 'partial';
      completenessReason =
        'Preferred manufacturers have no engineering-complete products. Ranking used other catalog products; preference did not invent specifications.';
    }
  } else if (exclusive && others.length) {
    completenessReason =
      'NO VALID DESIGN among preferred manufacturers — those products lack required engineering data or were excluded. Specifications were not invented.';
  }

  return { usable: exclusive ? preferred : usable, incomplete, completeness, completenessReason };
}

export function filterDisplays(catalog: EquipmentCatalog, req: DesignRequirements): CandidateFilterResult {
  const base = filterCategory(catalog, 'display', displayEngineeringReady, req);
  const min = req.presentation.sizeMinIn;
  const max = req.presentation.sizeMaxIn;
  if (min == null && max == null) return base;
  return {
    ...base,
    usable: base.usable.filter((p) => {
      const d = p.display!.diagonalInches;
      if (min != null && d < min) return false;
      if (max != null && d > max) return false;
      return true;
    })
  };
}

export function filterMics(catalog: EquipmentCatalog, req: DesignRequirements): CandidateFilterResult {
  const base = filterCategory(catalog, 'microphone', micEngineeringReady, req);
  const pref = req.microphones.typePreference;
  if (pref === 'no_preference') return base;
  const mount = pref === 'table' ? 'table' : 'ceiling';
  const matched = base.usable.filter((p) => p.microphone?.mount === mount);
  return {
    ...base,
    usable: matched,
    completeness: matched.length ? base.completeness : 'incomplete',
    completenessReason: matched.length
      ? base.completenessReason
      : `DATA INCOMPLETE — no ${mount} microphones with required pickup data. Other mounts were not substituted.`
  };
}

export function filterSpeakers(catalog: EquipmentCatalog, req: DesignRequirements): CandidateFilterResult {
  const base = filterCategory(catalog, 'speaker', speakerEngineeringReady, req);
  let usable = base.usable;
  if (req.constraints.noWallSpeakers || req.audio.speakerPreference === 'ceiling') {
    usable = usable.filter((p) => p.speaker?.mount !== 'wall');
  }
  if (req.audio.speakerPreference === 'wall') {
    const wall = usable.filter((p) => p.speaker?.mount === 'wall');
    return {
      ...base,
      usable: wall,
      completeness: wall.length ? 'partial' : 'incomplete',
      completenessReason: wall.length
        ? 'Wall speakers exist in catalog, but automatic placement only supports ceiling grids. Auto Design will not invent a wall-speaker layout.'
        : 'No wall-mount speakers with SPL + dispersion in catalog.'
    };
  }
  return { ...base, usable };
}

export function filterCameras(catalog: EquipmentCatalog, req: DesignRequirements): CandidateFilterResult {
  return filterCategory(catalog, 'camera', cameraEngineeringReady, req);
}

export function firstConnectable(
  catalog: EquipmentCatalog,
  category: EquipmentProduct['category'],
  req: DesignRequirements
): { product: EquipmentProduct | null; reason: string } {
  const products = catalog.byCategory(category);
  const { preferred } = applyManufacturerPref(products, req);
  const pool = req.constraints.manufacturersExclusive ? preferred : preferred.length ? preferred : products;
  for (const p of pool) {
    const miss = systemDeviceConnectable(p);
    if (!miss) return { product: p, reason: `Catalog ${p.manufacturer} ${p.model} declares ports.` };
  }
  return {
    product: null,
    reason: `DATA INCOMPLETE — no ${category} in catalog has declared ports. Paths were not invented.`
  };
}
