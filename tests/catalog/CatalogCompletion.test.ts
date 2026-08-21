/**
 * CatalogCompletion.test.ts
 * Tests for the completed AV equipment catalog.
 * Verifies that all required categories are represented, generic entries
 * exist, search/filtering works, and catalog data correctly integrates
 * with the existing placement, analysis, and connectivity systems.
 */

import { describe, it, expect } from 'vitest';
import { loadDefaultCatalog } from '../../src/catalog/loadCatalog';
import {
  CATEGORY_GROUPS,
  type EquipmentCategory,
  type EquipmentProduct,
} from '../../src/catalog/EquipmentCatalog';
import { filterCatalog, catalogMountKinds } from '../../src/catalog/CatalogEngineering';
import { resolveProductPorts } from '../../src/system/PortResolver';
import { canConnectPorts } from '../../src/system/PortCompatibility';
import { resolveInstancePorts } from '../../src/system/PortResolver';

/* ---------- helpers ---------- */

function catalogHasCategory(products: EquipmentProduct[], cat: EquipmentCategory): boolean {
  return products.some((p) => p.category === cat);
}

function genericFor(products: EquipmentProduct[], cat: EquipmentCategory): EquipmentProduct[] {
  return products.filter((p) => p.category === cat && p.manufacturer === 'Generic');
}

/* ============================================================
   1. Category representation
   ============================================================ */

describe('Catalog category representation', () => {
  const catalog = loadDefaultCatalog();
  const all = catalog.all();

  const requiredCategories: EquipmentCategory[] = [
    'display', 'camera', 'microphone', 'speaker',
    'dsp', 'amplifier', 'switcher', 'codec',
    'control', 'network', 'source', 'extender', 'rack',
  ];

  it.each(requiredCategories)('has at least one product in category: %s', (cat) => {
    expect(catalogHasCategory(all, cat)).toBe(true);
  });

  it('total catalog size is at least 35 products', () => {
    expect(all.length).toBeGreaterThanOrEqual(35);
  });
});

/* ============================================================
   2. Generic entries
   ============================================================ */

describe('Generic catalog entries', () => {
  const catalog = loadDefaultCatalog();
  const all = catalog.all();

  it('has a Generic Professional Display', () => {
    const generics = genericFor(all, 'display');
    expect(generics.length).toBeGreaterThanOrEqual(1);
    expect(generics.every((p) => p.display !== undefined)).toBe(true);
  });

  it('has a Generic PTZ Camera', () => {
    const cams = genericFor(all, 'camera');
    expect(cams.length).toBeGreaterThanOrEqual(1);
    const ptz = cams.find((p) => p.type === 'ptz_camera');
    expect(ptz).toBeDefined();
  });

  it('has a Generic Ceiling Microphone', () => {
    const mics = genericFor(all, 'microphone');
    const ceiling = mics.find((p) => p.microphone?.mount === 'ceiling');
    expect(ceiling).toBeDefined();
    expect(ceiling!.microphone!.pickupRadiusM).toBeGreaterThan(0);
  });

  it('has a Generic Table Microphone', () => {
    const mics = genericFor(all, 'microphone');
    const table = mics.find((p) => p.microphone?.mount === 'table' && p.type === 'table_array');
    expect(table).toBeDefined();
    expect(table!.microphone!.pickupRadiusM).toBeGreaterThan(0);
  });

  it('has a Generic Boundary Microphone', () => {
    const mics = genericFor(all, 'microphone');
    const boundary = mics.find((p) => p.type === 'boundary');
    expect(boundary).toBeDefined();
  });

  it('has a Generic Ceiling Speaker', () => {
    const spks = genericFor(all, 'speaker');
    const ceiling = spks.find((p) => p.speaker?.mount === 'ceiling');
    expect(ceiling).toBeDefined();
  });

  it('has a Generic Wall Speaker', () => {
    const spks = genericFor(all, 'speaker');
    const wall = spks.find((p) => p.speaker?.mount === 'wall');
    expect(wall).toBeDefined();
  });

  it('has a Generic DSP', () => {
    const dsps = genericFor(all, 'dsp');
    expect(dsps.length).toBeGreaterThanOrEqual(1);
  });

  it('has a Generic Amplifier', () => {
    const amps = genericFor(all, 'amplifier');
    expect(amps.length).toBeGreaterThanOrEqual(1);
  });

  it('has a Generic AV Switcher', () => {
    const sws = genericFor(all, 'switcher');
    expect(sws.length).toBeGreaterThanOrEqual(1);
  });

  it('has a Generic Matrix Switcher', () => {
    const sws = genericFor(all, 'switcher');
    const matrix = sws.find((p) => p.type === 'hdmi_matrix');
    expect(matrix).toBeDefined();
  });

  it('has a Generic Video Conference Codec', () => {
    const codecs = genericFor(all, 'codec');
    expect(codecs.length).toBeGreaterThanOrEqual(1);
  });

  it('has a Generic Network Switch', () => {
    const nets = genericFor(all, 'network');
    expect(nets.length).toBeGreaterThanOrEqual(1);
  });

  it('has a Generic Control Processor', () => {
    const ctrls = genericFor(all, 'control');
    const processor = ctrls.find((p) => p.type === 'control_processor');
    expect(processor).toBeDefined();
  });

  it('has a Generic Floor Rack', () => {
    const racks = genericFor(all, 'rack');
    const floor = racks.find((p) => p.type === 'floor_rack');
    expect(floor).toBeDefined();
  });

  it('has a Generic Wall Rack', () => {
    const racks = genericFor(all, 'rack');
    const wall = racks.find((p) => p.type === 'wall_rack');
    expect(wall).toBeDefined();
  });
});

/* ============================================================
   3. Search and filtering
   ============================================================ */

describe('Catalog search and filtering', () => {
  const catalog = loadDefaultCatalog();

  it('text search for "PTZ" finds cameras', () => {
    const results = catalog.search({ text: 'PTZ' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((p) => p.category === 'camera')).toBe(true);
  });

  it('text search for "ceiling" finds mics and speakers', () => {
    const results = catalog.search({ text: 'ceiling' });
    expect(results.length).toBeGreaterThanOrEqual(2);
    const cats = new Set(results.map((p) => p.category));
    expect(cats.has('microphone') || cats.has('speaker')).toBe(true);
  });

  it('text search for "DSP" finds DSPs', () => {
    const results = catalog.search({ text: 'DSP' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((p) => p.category === 'dsp')).toBe(true);
  });

  it('text search for "codec" finds codecs', () => {
    const results = catalog.search({ text: 'codec' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((p) => p.category === 'codec')).toBe(true);
  });

  it('text search for "rack" finds rack products', () => {
    const results = catalog.search({ text: 'rack' });
    expect(results.some((p) => p.category === 'rack')).toBe(true);
  });

  it('text search for "matrix" finds matrix switcher', () => {
    const results = catalog.search({ text: 'matrix' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((p) => p.category === 'switcher')).toBe(true);
  });

  it('text search for "boundary" finds boundary mic', () => {
    const results = catalog.search({ text: 'boundary' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((p) => p.category === 'microphone')).toBe(true);
  });

  it('category filter returns only matching products', () => {
    const dsps = catalog.byCategory('dsp');
    expect(dsps.length).toBeGreaterThanOrEqual(2);
    expect(dsps.every((p) => p.category === 'dsp')).toBe(true);
  });

  it('filterCatalog by groupId works for new collaboration group', () => {
    const codecs = catalog.byGroup('collaboration');
    expect(codecs.length).toBeGreaterThanOrEqual(1);
    expect(codecs.every((p) => p.category === 'codec')).toBe(true);
  });

  it('filterCatalog by groupId works for infrastructure', () => {
    const infra = catalog.byGroup('infrastructure');
    expect(infra.length).toBeGreaterThanOrEqual(1);
    // codec should NOT be in infrastructure anymore
    expect(infra.every((p) => p.category !== 'codec')).toBe(true);
  });
});

/* ============================================================
   4. Physical dimensions and mounting
   ============================================================ */

describe('Catalog physical dimensions and mounting', () => {
  const catalog = loadDefaultCatalog();

  it('all products have non-zero physical dimensions', () => {
    for (const p of catalog.all()) {
      expect(p.physical.width).toBeGreaterThan(0);
      expect(p.physical.height).toBeGreaterThan(0);
      expect(p.physical.depth).toBeGreaterThan(0);
    }
  });

  it('ceiling microphone has ceiling mounting', () => {
    const mic = catalog.get('generic-ceiling-mic');
    expect(mic).toBeDefined();
    expect(mic!.mounting?.ceiling).toBe(true);
    const kinds = catalogMountKinds(mic!);
    expect(kinds).toContain('ceiling');
  });

  it('wall speaker has wall mounting', () => {
    const spk = catalog.get('generic-wall-speaker');
    expect(spk).toBeDefined();
    expect(spk!.mounting?.wall).toBe(true);
    const kinds = catalogMountKinds(spk!);
    expect(kinds).toContain('wall');
  });

  it('rack-mountable DSP has rack mounting', () => {
    const dsp = catalog.get('generic-dsp-8x8');
    expect(dsp).toBeDefined();
    expect(dsp!.mounting?.rack).toBe(true);
    const kinds = catalogMountKinds(dsp!);
    expect(kinds).toContain('rack');
  });

  it('floor rack has floor mounting', () => {
    const rack = catalog.get('generic-floor-rack-42u');
    expect(rack).toBeDefined();
    expect(rack!.mounting?.floor).toBe(true);
  });

  it('codec supports rack and table mounting', () => {
    const codec = catalog.get('generic-codec');
    expect(codec).toBeDefined();
    expect(codec!.mounting?.rack).toBe(true);
    expect(codec!.mounting?.table).toBe(true);
  });
});

/* ============================================================
   5. Port integration
   ============================================================ */

describe('Catalog port integration', () => {
  const catalog = loadDefaultCatalog();

  it('Generic DSP has input and output ports', () => {
    const dsp = catalog.get('generic-dsp-8x8')!;
    const { ports } = resolveProductPorts(dsp);
    const inputs = ports.filter((p) => p.direction === 'input');
    const outputs = ports.filter((p) => p.direction === 'output');
    expect(inputs.length).toBeGreaterThanOrEqual(4);
    expect(outputs.length).toBeGreaterThanOrEqual(4);
  });

  it('Generic AV Switcher has HDMI input and output ports', () => {
    const sw = catalog.get('generic-av-switcher-4x2')!;
    const { ports } = resolveProductPorts(sw);
    const hdmiIn = ports.filter((p) => p.direction === 'input' && p.connector === 'hdmi');
    const hdmiOut = ports.filter((p) => p.direction === 'output' && p.connector === 'hdmi');
    expect(hdmiIn.length).toBeGreaterThanOrEqual(4);
    expect(hdmiOut.length).toBeGreaterThanOrEqual(2);
  });

  it('Generic Codec has HDMI, USB, and network ports', () => {
    const codec = catalog.get('generic-codec')!;
    const { ports } = resolveProductPorts(codec);
    expect(ports.some((p) => p.connector === 'hdmi' && p.direction === 'input')).toBe(true);
    expect(ports.some((p) => p.connector === 'hdmi' && p.direction === 'output')).toBe(true);
    expect(ports.some((p) => p.connector === 'usbc')).toBe(true);
    expect(ports.some((p) => p.connector === 'rj45')).toBe(true);
  });

  it('Generic PTZ Camera has video output port', () => {
    const cam = catalog.get('generic-ptz-camera')!;
    const { ports } = resolveProductPorts(cam);
    const outputs = ports.filter((p) => p.direction === 'output');
    expect(outputs.length).toBeGreaterThanOrEqual(1);
    expect(outputs.some((p) => p.signalTypes.includes('VIDEO'))).toBe(true);
  });

  it('switcher HDMI out can connect to display HDMI in', () => {
    const sw = catalog.get('generic-av-switcher-4x2')!;
    const disp = catalog.get('lg-86uh5j')!;
    const swPorts = resolveInstancePorts('sw-1', sw.id, catalog);
    const dispPorts = resolveInstancePorts('disp-1', disp.id, catalog);
    const swOut = swPorts.find((p) => p.id === 'hdmi-out-1');
    const dispIn = dispPorts.find((p) => p.connector === 'hdmi' && p.direction === 'input');
    expect(swOut).toBeDefined();
    expect(dispIn).toBeDefined();
    const result = canConnectPorts(swOut!, dispIn!);
    expect(result.ok).toBe(true);
  });

  it('DSP line out can connect to amplifier line in', () => {
    const dsp = catalog.get('generic-dsp-8x8')!;
    const amp = catalog.get('generic-amplifier-4ch')!;
    const dspPorts = resolveInstancePorts('dsp-1', dsp.id, catalog);
    const ampPorts = resolveInstancePorts('amp-1', amp.id, catalog);
    const dspOut = dspPorts.find((p) => p.id === 'line-out-1');
    const ampIn = ampPorts.find((p) => p.id === 'line-in-1');
    expect(dspOut).toBeDefined();
    expect(ampIn).toBeDefined();
    const result = canConnectPorts(dspOut!, ampIn!);
    expect(result.ok).toBe(true);
  });

  it('amplifier speaker out can connect to passive ceiling speaker', () => {
    const amp = catalog.get('generic-amplifier-4ch')!;
    const spk = catalog.get('generic-ceiling-speaker')!;
    const ampPorts = resolveInstancePorts('amp-1', amp.id, catalog);
    const spkPorts = resolveInstancePorts('spk-1', spk.id, catalog);
    const ampOut = ampPorts.find((p) => p.id === 'spk-out-1');
    const spkIn = spkPorts.find((p) => p.id === 'spk-in');
    expect(ampOut).toBeDefined();
    expect(spkIn).toBeDefined();
    const result = canConnectPorts(ampOut!, spkIn!);
    expect(result.ok).toBe(true);
  });
});

/* ============================================================
   6. Analysis engine integration
   ============================================================ */

describe('Catalog analysis engine integration', () => {
  const catalog = loadDefaultCatalog();

  it('generic ceiling mic integrates with mic coverage (has pickupRadiusM)', () => {
    const mic = catalog.get('generic-ceiling-mic')!;
    expect(mic.microphone).toBeDefined();
    expect(mic.microphone!.pickupRadiusM).toBeGreaterThan(0);
    expect(mic.microphone!.mount).toBe('ceiling');
  });

  it('generic gooseneck mic has directional sector model', () => {
    const mic = catalog.get('generic-gooseneck-mic')!;
    expect(mic.microphone).toBeDefined();
    expect(mic.microphone!.coverageModel).toBe('directional_sector');
    expect(mic.microphone!.beamWidthDeg).toBeGreaterThan(0);
    expect(mic.microphone!.pickupRadiusM).toBeGreaterThan(0);
  });

  it('generic ceiling speaker intentionally omits SPL/dispersion (not invented)', () => {
    const spk = catalog.get('generic-ceiling-speaker')!;
    expect(spk.speaker).toBeDefined();
    expect(spk.speaker!.mount).toBe('ceiling');
    // Generic speakers must NOT invent SPL or dispersion
    expect(spk.speaker!.maxSplAt1m).toBeUndefined();
    expect(spk.speaker!.dispersionDeg).toBeUndefined();
  });

  it('generic PTZ camera intentionally omits FOV (not invented)', () => {
    const cam = catalog.get('generic-ptz-camera')!;
    expect(cam.camera).toBeDefined();
    expect(cam.camera!.mount).toBe('wall');
    // Generic cameras must NOT invent FOV
    expect(cam.camera!.horizontalFovDeg).toBeUndefined();
    expect(cam.camera!.verticalFovDeg).toBeUndefined();
  });

  it('verified cameras still have real FOV data', () => {
    const cam = catalog.get('yealink-uvc84')!;
    expect(cam.camera!.horizontalFovDeg).toBe(81.9);
    expect(cam.camera!.verticalFovDeg).toBe(52.2);
  });

  it('verified speakers still have real SPL and dispersion', () => {
    const spk = catalog.get('qsc-adc6t')!;
    expect(spk.speaker!.maxSplAt1m).toBe(113);
    expect(spk.speaker!.dispersionDeg).toBe(130);
  });
});

/* ============================================================
   7. Rack integration
   ============================================================ */

describe('Catalog rack integration', () => {
  const catalog = loadDefaultCatalog();

  it('rack-mountable products define rackUnits from catalog, not inferred', () => {
    const dsp = catalog.get('generic-dsp-8x8')!;
    expect(dsp.rackUnits).toBe(1);
    const matrix = catalog.get('generic-matrix-switcher-8x8')!;
    expect(matrix.rackUnits).toBe(2);
  });

  it('products without verified rackUnits do not define rackUnits', () => {
    // The user-supplied 4ch DSP does not specify RU
    const dsp = catalog.get('user-dsp-4ch')!;
    expect(dsp.rackUnits).toBeUndefined();
  });

  it('rack products are in the rack category', () => {
    const floorRack = catalog.get('generic-floor-rack-42u')!;
    expect(floorRack.category).toBe('rack');
    const wallRack = catalog.get('generic-wall-rack-12u')!;
    expect(wallRack.category).toBe('rack');
  });
});

/* ============================================================
   8. CATEGORY_GROUPS browsing
   ============================================================ */

describe('CATEGORY_GROUPS browsing taxonomy', () => {
  it('collaboration group contains codec', () => {
    const collab = CATEGORY_GROUPS.find((g) => g.id === 'collaboration');
    expect(collab).toBeDefined();
    expect(collab!.categories).toContain('codec');
  });

  it('infrastructure group does not contain codec', () => {
    const infra = CATEGORY_GROUPS.find((g) => g.id === 'infrastructure');
    expect(infra).toBeDefined();
    expect(infra!.categories).not.toContain('codec');
  });

  it('every EquipmentCategory appears in at least one group', () => {
    const allGroupCats = CATEGORY_GROUPS.flatMap((g) => g.categories);
    const requiredCats: EquipmentCategory[] = [
      'display', 'projector', 'video_wall', 'speaker', 'microphone',
      'camera', 'dsp', 'amplifier', 'codec', 'switcher', 'control',
      'rack', 'infrastructure', 'source', 'extender', 'network',
    ];
    for (const cat of requiredCats) {
      expect(allGroupCats).toContain(cat);
    }
  });
});

/* ============================================================
   9. Provenance honesty
   ============================================================ */

describe('Catalog provenance honesty', () => {
  const catalog = loadDefaultCatalog();

  it('all generic products are marked user_defined', () => {
    const generics = catalog.all().filter((p) => p.manufacturer === 'Generic');
    expect(generics.length).toBeGreaterThanOrEqual(10);
    for (const p of generics) {
      expect(p.provenance).toBe('user_defined');
    }
  });

  it('all products have a source string', () => {
    for (const p of catalog.all()) {
      expect(p.source).toBeDefined();
      expect(typeof p.source).toBe('string');
      expect(p.source!.length).toBeGreaterThan(0);
    }
  });

  it('all products have valid provenance', () => {
    const valid = ['verified', 'estimated', 'user_defined'];
    for (const p of catalog.all()) {
      expect(valid).toContain(p.provenance);
    }
  });
});
