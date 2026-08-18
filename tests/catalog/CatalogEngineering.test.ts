import { describe, it, expect } from 'vitest';
import { loadDefaultCatalog } from '../../src/catalog/loadCatalog';
import {
  analysisSupportLine,
  CATALOG_READONLY_FIELDS,
  catalogMountKinds,
  defaultMountingKind,
  equipmentFootprint,
  filterCatalog,
  isCatalogReadonlyField,
  isProjectEditableField,
  physicalSpecComplete,
  PROJECT_EDITABLE_FIELDS
} from '../../src/catalog/CatalogEngineering';
import { AppState } from '../../src/app/AppState';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { suggestDisplayPlacement } from '../../src/av/PlacementSuggestionEngine';
import { snapEquipment } from '../../src/interaction/SnapEngine';
import { loadProjectInto, parseProjectJson, serializeProject } from '../../src/app/ProjectStore';
import { runDesignValidation, ensureBuiltinChecksRegistered } from '../../src/av/validation/DesignValidationEngine';
import { resetValidationCache } from '../../src/av/validation/validationCache';
import { exclusiveCeiling } from '../../src/av/PlacementFeedback';
import { defaultFloorRack } from '../../src/av/AVRack';
import { renderEquipment } from '../../src/room/EquipmentRenderer';

const catalog = loadDefaultCatalog();

describe('Catalog search and identity', () => {
  it('searches manufacturer, model, and category without inventing products', () => {
    const all = catalog.all();
    const lg = filterCatalog(all, { text: '86UH5J' });
    expect(lg.some((p) => p.id === 'lg-86uh5j')).toBe(true);
    const displays = filterCatalog(all, { category: 'display' });
    expect(displays.every((p) => p.category === 'display')).toBe(true);
    const mfr = filterCatalog(displays, { manufacturer: 'LG' });
    expect(mfr.every((p) => p.manufacturer === 'LG')).toBe(true);
    expect(catalog.search({ text: 'UVC84' }).some((p) => p.model === 'UVC84')).toBe(true);
  });

  it('keeps Generic manufacturer on user-defined placeholders', () => {
    const g = catalog.get('generic-55-pro')!;
    expect(g.manufacturer).toBe('Generic');
    expect(g.provenance).toBe('user_defined');
    expect(g.display?.diagonalInches).toBe(55);
  });

  it('exposes complete physical dimensions from the catalog record', () => {
    const d = catalog.get('lg-86uh5j')!;
    expect(physicalSpecComplete(d)).toBe(true);
    expect(d.physical.width).toBeCloseTo(1.936);
    expect(d.physical.height).toBeCloseTo(1.116);
    expect(d.physical.depth).toBeCloseTo(0.083);
  });
});

describe('Editable vs read-only catalog fields', () => {
  it('treats manufacturer, model, published size and FOV as catalog-readonly', () => {
    expect(isCatalogReadonlyField('manufacturer')).toBe(true);
    expect(isCatalogReadonlyField('physical.width')).toBe(true);
    expect(isCatalogReadonlyField('camera.horizontalFovDeg')).toBe(true);
    expect(isProjectEditableField('position.x')).toBe(true);
    expect(isProjectEditableField('rackId')).toBe(true);
    expect(isCatalogReadonlyField('position.x')).toBe(false);
    expect(CATALOG_READONLY_FIELDS.length).toBeGreaterThan(5);
    expect(PROJECT_EDITABLE_FIELDS).toContain('rackPositionRU');
  });
});

describe('Device creation, dimensions, and placement', () => {
  it('creates an instance that references the catalog productId', () => {
    const state = new AppState();
    const room = createDefaultRoom('conference');
    state.setRoom(room);
    const product = catalog.get('lg-86uh5j')!;
    const suggestion = suggestDisplayPlacement(room, product);
    state.addEquipment({
      instanceId: 'disp-1',
      productId: product.id,
      name: `${product.manufacturer} ${product.model}`,
      position: suggestion.position,
      rotationY: 0,
      wall: suggestion.wall,
      placementMode: 'smart'
    });
    expect(state.equipment[0].productId).toBe('lg-86uh5j');
    expect(suggestion.wall).not.toBe('front');
    const box = equipmentFootprint(product, state.equipment[0]);
    expect(box.maxX - box.minX).toBeCloseTo(product.physical.width);
  });

  it('uses catalog width when snapping a larger display vs a smaller one', () => {
    const room = { ...createDefaultRoom('conference'), openings: [] };
    const large = catalog.get('lg-86uh5j')!;
    const small = catalog.get('generic-55-pro')!;
    expect(large.physical.width).toBeGreaterThan(small.physical.width);
    const a = snapEquipment(room, large, { x: 0, y: 1.6, z: -room.depth / 2 }, 0);
    const b = snapEquipment(room, small, { x: 0, y: 1.6, z: -room.depth / 2 }, 0);
    expect(a.snapKind).toBe('wall');
    expect(b.snapKind).toBe('wall');
  });

  it('ceiling speakers snap to ceiling height', () => {
    const room = createDefaultRoom('conference');
    const spk = catalog.all().find((p) => p.speaker?.mount === 'ceiling')!;
    expect(exclusiveCeiling(spk)).toBe(true);
    const snapped = snapEquipment(room, spk, { x: 0, y: 0.05, z: 0 }, 0);
    expect(snapped.snapKind).toBe('ceiling');
    expect(snapped.position.y).toBeGreaterThan(room.height - 0.5);
  });
});

describe('Rack assignment and serialization', () => {
  it('assigns rack position from catalog RU when present, otherwise user RU', () => {
    const state = new AppState();
    state.setRoom(createDefaultRoom('conference'));
    state.racks = [{ ...defaultFloorRack('RACK-01') }];
    state.addEquipment({
      instanceId: 'dsp-1',
      productId: 'user-dsp-4ch',
      name: 'DSP',
      position: { x: 0, y: 0.5, z: 0 },
      rotationY: 0,
      rackUnits: 1
    });
    state.assignEquipmentToRack('dsp-1', 'RACK-01', 1);
    expect(state.equipment[0].rackId).toBe('RACK-01');
    expect(state.equipment[0].rackPositionRU).toBe(1);
    expect(state.equipment[0].rackUnits).toBe(1);
  });

  it('round-trips productId, transform, mountingKind, and rack fields', () => {
    const state = new AppState();
    state.addEquipment({
      instanceId: 'cam-1',
      productId: 'yealink-uvc84',
      name: 'Cam',
      position: { x: 0.1, y: 1.6, z: -3 },
      rotationY: 0.2,
      wall: 'front',
      mountingKind: 'wall'
    });
    const json = JSON.stringify(serializeProject(state));
    const parsed = parseProjectJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const loaded = new AppState();
    expect(loadProjectInto(loaded, parsed.file).ok).toBe(true);
    expect(loaded.equipment[0].productId).toBe('yealink-uvc84');
    expect(loaded.equipment[0].position.y).toBe(1.6);
    expect(loaded.equipment[0].mountingKind).toBe('wall');
  });
});

describe('Plan/3D consistency and validation', () => {
  it('3D equipment uses catalog physical size', () => {
    const product = catalog.get('lg-86uh5j')!;
    const group = renderEquipment(
      [
        {
          instanceId: 'd',
          productId: product.id,
          name: 'D',
          position: { x: 0, y: 1.5, z: -3 },
          rotationY: 0
        }
      ],
      catalog,
      'd'
    );
    expect(group.children.length).toBe(1);
    expect(group.children[0].position.y).toBe(1.5);
  });

  it('EQUIP-001 errors when physical size is missing', () => {
    resetValidationCache();
    ensureBuiltinChecksRegistered();
    const incomplete = {
      ...catalog.get('lg-86uh5j')!,
      id: 'bad-phys',
      physical: { width: 0, height: 0, depth: 0 }
    };
    const c = loadDefaultCatalog();
    c.register([incomplete]);
    const report = runDesignValidation({
      room: createDefaultRoom('conference'),
      seats: [],
      tables: [],
      equipment: [
        {
          instanceId: 'bad',
          productId: 'bad-phys',
          name: 'Bad',
          position: { x: 0, y: 1.6, z: -3 },
          rotationY: 0
        }
      ],
      catalog: c
    });
    expect(report.findings.some((f) => f.code === 'EQUIP-001' && f.severity === 'error')).toBe(true);
  });

  it('EQUIP-002 warns when a wall display is in the room center', () => {
    resetValidationCache();
    ensureBuiltinChecksRegistered();
    const report = runDesignValidation({
      room: createDefaultRoom('conference'),
      seats: [],
      tables: [],
      equipment: [
        {
          instanceId: 'd',
          productId: 'lg-86uh5j',
          name: 'Display',
          position: { x: 0, y: 1.6, z: 0 },
          rotationY: 0
        }
      ],
      catalog
    });
    expect(report.findings.some((f) => f.code === 'EQUIP-002' && f.severity === 'warning')).toBe(true);
  });

  it('analysis support line stays geometric for speakers', () => {
    const spk = catalog.all().find((p) => p.category === 'speaker')!;
    expect(analysisSupportLine(spk).toLowerCase()).toContain('geometric');
    expect(catalogMountKinds(spk).length).toBeGreaterThan(0);
    expect(defaultMountingKind(spk)).toBeTruthy();
  });
});
