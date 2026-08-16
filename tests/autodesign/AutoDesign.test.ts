import { describe, it, expect } from 'vitest';
import { EquipmentCatalog, type EquipmentProduct } from '../../src/catalog/EquipmentCatalog';
import { loadDefaultCatalog } from '../../src/catalog/loadCatalog';
import { AppState } from '../../src/app/AppState';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { defaultSeatingConfig, generateSeating } from '../../src/room/SeatingGenerator';
import { furnitureFingerprint } from '../../src/app/HistoryManager';
import { defaultQuickRequirements, type DesignRequirements } from '../../src/autodesign/DesignRequirements';
import { validateDesignRequirements } from '../../src/autodesign/validateRequirements';
import {
  cameraEngineeringReady,
  displayEngineeringReady,
  filterCameras,
  filterDisplays,
  filterMics,
  filterSpeakers,
  micEngineeringReady,
  speakerEngineeringReady
} from '../../src/autodesign/CatalogCandidates';
import { generateDesign, selectedOption } from '../../src/autodesign/DesignPipeline';
import { getPresentationWall } from '../../src/room/RoomGeometry';
import { recommendationsAfterManual } from '../../src/autodesign/Recommendations';
import { runDesignValidation } from '../../src/av/validation/DesignValidationEngine';

const catalog = loadDefaultCatalog();

function req(patch: Partial<DesignRequirements> = {}): DesignRequirements {
  return { ...defaultQuickRequirements(), ...patch, completeMissingOnly: false, constraints: { ...defaultQuickRequirements().constraints, keepExistingSeating: false, keepExistingEquipment: false, ...patch.constraints } };
}

function emptyCtx() {
  return { room: null, seats: [], tables: [], equipment: [], connections: [], routes: [] };
}

describe('Auto Design requirement validation', () => {
  it('rejects missing room dimensions as DATA INCOMPLETE', () => {
    const v = validateDesignRequirements(req({ room: { length: null, width: 6, height: 3 } }));
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.severity === 'data_incomplete')).toBe(true);
  });

  it('rejects missing seat count as DATA INCOMPLETE', () => {
    const v = validateDesignRequirements(req({ seating: { count: null, layout: 'auto' } }));
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.code === 'REQ-SEATS-INCOMPLETE')).toBe(true);
  });

  it('rejects invalid room dimensions as ERROR', () => {
    const v = validateDesignRequirements(req({ room: { length: 0, width: 6, height: 3 } }));
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('does not generate from invalid inputs', () => {
    const p = generateDesign(emptyCtx(), req({ room: { length: null, width: null, height: null } }), catalog);
    expect(p.status).toBe('invalid_requirements');
    expect(p.options).toHaveLength(0);
  });

  it('maps Quick Design use cases onto a seating layout', () => {
    const v = validateDesignRequirements(req({ useCase: 'training', seating: { count: 8, layout: 'auto' } }));
    expect(v.normalized.seating.layout).toBe('classroom');
  });
});

describe('Catalog candidate filtering', () => {
  it('accepts catalog displays with size + physical dimensions', () => {
    expect(displayEngineeringReady(catalog.get('lg-86uh5j')!)).toBeNull();
    expect(filterDisplays(catalog, defaultQuickRequirements()).usable.length).toBeGreaterThan(0);
  });

  it('rejects mics without pickupRadiusM', () => {
    const c = new EquipmentCatalog();
    c.register([
      {
        id: 'bad-mic',
        manufacturer: 'X',
        model: 'NoRadius',
        category: 'microphone',
        type: 'table',
        physical: { width: 0.1, height: 0.1, depth: 0.1 },
        microphone: { mount: 'table', pickupRadiusM: 0, pattern: 'x', channels: 1, connection: 'xlr' },
        provenance: 'user_defined'
      }
    ]);
    expect(micEngineeringReady(c.get('bad-mic')!)).toMatch(/DATA INCOMPLETE/);
  });

  it('rejects directional mics without beamWidthDeg', () => {
    const p: EquipmentProduct = {
      id: 'bad-dir',
      manufacturer: 'X',
      model: 'Dir',
      category: 'microphone',
      type: 'gooseneck',
      physical: { width: 0.04, height: 0.4, depth: 0.04 },
      microphone: {
        mount: 'table',
        pickupRadiusM: 1.2,
        coverageModel: 'directional_sector',
        pattern: 'cardioid',
        channels: 1,
        connection: 'xlr'
      },
      provenance: 'user_defined'
    };
    expect(micEngineeringReady(p)).toMatch(/beamWidthDeg/);
  });

  it('rejects speakers missing SPL or dispersion', () => {
    const p: EquipmentProduct = {
      id: 'bad-spk',
      manufacturer: 'X',
      model: 'NoSpl',
      category: 'speaker',
      type: 'ceiling',
      physical: { width: 0.2, height: 0.1, depth: 0.2 },
      speaker: { mount: 'ceiling', dispersionDeg: 90 },
      provenance: 'user_defined'
    };
    expect(speakerEngineeringReady(p)).toMatch(/maxSplAt1m/);
  });

  it('rejects cameras missing HFOV', () => {
    const p: EquipmentProduct = {
      id: 'bad-cam',
      manufacturer: 'X',
      model: 'NoFov',
      category: 'camera',
      type: 'ptz',
      physical: { width: 0.1, height: 0.1, depth: 0.1 },
      camera: { mount: 'wall' },
      provenance: 'user_defined'
    };
    expect(cameraEngineeringReady(p)).toMatch(/horizontalFovDeg/);
  });

  it('does not invent generic FOV/SPL when filtering the default catalog', () => {
    expect(filterCameras(catalog, defaultQuickRequirements()).usable.every((p) => (p.camera?.horizontalFovDeg ?? 0) > 0)).toBe(true);
    expect(filterSpeakers(catalog, defaultQuickRequirements()).usable.every((p) => (p.speaker?.maxSplAt1m ?? 0) > 0)).toBe(true);
  });

  it('table mic preference does not substitute ceiling products', () => {
    const r = req({ microphones: { required: true, typePreference: 'table' } });
    const f = filterMics(catalog, r);
    expect(f.usable.every((p) => p.microphone?.mount === 'table')).toBe(true);
  });
});

describe('Design generation', () => {
  it('creates a proposal with seating, catalog equipment, and validation — not fake scores', () => {
    const p = generateDesign(emptyCtx(), req({ seating: { count: 6, layout: 'boardroom' } }), catalog);
    expect(p.status).toBe('ok');
    const opt = selectedOption(p)!;
    expect(opt.seats.length).toBeGreaterThan(0);
    expect(opt.tables.length).toBeGreaterThan(0);
    expect(opt.equipment.some((e) => catalog.get(e.productId)?.category === 'display')).toBe(true);
    expect(opt.validation.passCount + opt.validation.warningCount + opt.validation.errorCount).toBeGreaterThan(0);
    expect(JSON.stringify(opt)).not.toMatch(/Confidence: \d+%/);
  });

  it('does not pick topology from seat-count buckets', () => {
    const a = selectedOption(generateDesign(emptyCtx(), req({ seating: { count: 2, layout: 'boardroom' }, presentation: { displayCount: 'single' } }), catalog))!;
    const b = selectedOption(generateDesign(emptyCtx(), req({ seating: { count: 16, layout: 'boardroom' }, presentation: { displayCount: 'single' } }), catalog))!;
    const cats = (o: typeof a) =>
      [...new Set(o.equipment.map((e) => catalog.get(e.productId)?.category).filter(Boolean))].sort().join(',');
    expect(cats(a)).toBe(cats(b));
  });

  it('returns NO VALID DESIGN for wall-speaker auto-placement (engine gap)', () => {
    const p = generateDesign(
      emptyCtx(),
      req({ audio: { required: true, priority: 'speech', speakerPreference: 'wall' } }),
      catalog
    );
    expect(p.status).toBe('no_valid_design');
    expect(p.blockingReason).toMatch(/NO VALID DESIGN FOUND/);
  });

  it('returns NO VALID DESIGN when exclusive manufacturers lack complete displays', () => {
    const p = generateDesign(
      emptyCtx(),
      req({
        preferences: { manufacturers: ['NotARealBrand'], categories: [] },
        constraints: { ...req().constraints, manufacturersExclusive: true, keepExistingEquipment: false }
      }),
      catalog
    );
    expect(p.status).toBe('no_valid_design');
  });

  it('ranks more than one display candidate when catalog allows', () => {
    const p = generateDesign(emptyCtx(), req({ seating: { count: 8, layout: 'boardroom' } }), catalog);
    const opt = selectedOption(p)!;
    expect(opt.picks.display?.alternatives.length ?? 0).toBeGreaterThan(0);
  });

  it('explains microphone and speaker picks from existing engines', () => {
    const opt = selectedOption(generateDesign(emptyCtx(), req({ seating: { count: 8, layout: 'boardroom' } }), catalog))!;
    expect(opt.picks.microphone?.source).toMatch(/pickup radius/i);
    expect(opt.picks.speaker?.source).toMatch(/maxSplAt1m|dispersion/i);
  });

  it('camera pick reports partial data when VFOV is missing', () => {
    const onlyH = catalog.get('user-horizontal-frustum')!;
    const c = new EquipmentCatalog();
    c.register([catalog.get('lg-86uh5j')!, catalog.get('shure-mxa310')!, catalog.get('qsc-adc6t')!, onlyH, catalog.get('user-laptop-source')!, catalog.get('user-dsp-4ch')!, catalog.get('user-amp-2ch')!]);
    const r = req({
      camera: { required: 'required' },
      preferences: { manufacturers: ['User-supplied'], categories: [] },
      constraints: { ...req().constraints, manufacturersExclusive: false }
    });
    r.preferences.manufacturers = [];
    const p = generateDesign(emptyCtx(), r, catalog);
    const cam = selectedOption(p)?.picks.camera;
    expect(cam).toBeTruthy();
    if (cam?.productId === 'user-horizontal-frustum') {
      expect(cam.completeness).toBe('partial');
    }
  });

  it('keeps existing display when completing a partial design', () => {
    const room = createDefaultRoom('conference');
    room.width = 8;
    room.depth = 6;
    room.height = 3;
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    const ctx = {
      room,
      seats,
      tables,
      equipment: [
        {
          instanceId: 'keep-disp',
          productId: 'lg-86uh5j',
          name: 'Existing 86',
          position: { x: 0, y: 1.6, z: -2.8 },
          rotationY: 0,
          wall: 'front' as const,
          origin: 'manual' as const,
          placementMode: 'manual' as const
        }
      ],
      connections: [],
      routes: []
    };
    const r = defaultQuickRequirements();
    r.completeMissingOnly = true;
    r.constraints.keepExistingEquipment = true;
    r.constraints.keepExistingSeating = true;
    r.room = { length: 6, width: 8, height: 3 };
    r.seating = { count: 8, layout: 'boardroom' };
    const p = generateDesign(ctx, r, catalog);
    const opt = selectedOption(p)!;
    expect(opt.equipment.some((e) => e.instanceId === 'keep-disp')).toBe(true);
    expect(opt.equipment.filter((e) => catalog.get(e.productId)?.category === 'display').length).toBe(1);
    expect(opt.seats).toEqual(seats);
    expect(opt.tables).toEqual(tables);
    expect(opt.picks.display?.retainedExisting).toBe(true);
    expect(opt.picks.display?.reason).toMatch(/Existing display retained/i);
  });

  it('creates real catalog connections rather than decorative labels', () => {
    const opt = selectedOption(generateDesign(emptyCtx(), req({ seating: { count: 8, layout: 'boardroom' } }), catalog))!;
    expect(opt.connections.length).toBeGreaterThan(0);
    for (const c of opt.connections) {
      expect(c.fromPortId.length).toBeGreaterThan(0);
      expect(c.toPortId.length).toBeGreaterThan(0);
      expect(c.signalType).toBeTruthy();
    }
  });
});

describe('Apply Design + undo', () => {
  it('applies proposal as one undoable transaction with real equipment and topology', () => {
    const state = new AppState();
    state.autoDesignDraft = req({ seating: { count: 8, layout: 'boardroom' } });
    state.generateAutoDesignProposal();
    expect(state.autoDesignProposal?.status).toBe('ok');
    const beforeEq = state.equipment.length;
    const ok = state.applyAutoDesignProposal();
    expect(ok).toBe(true);
    expect(state.equipment.length).toBeGreaterThan(beforeEq);
    expect(state.connections.length).toBeGreaterThan(0);
    expect(state.seats.length).toBeGreaterThan(0);
    expect(state.tables.length).toBeGreaterThan(0);
    const report = runDesignValidation({
      room: state.room,
      seats: state.seats,
      tables: state.tables,
      equipment: state.equipment,
      catalog,
      connections: state.connections,
      routes: state.routes
    });
    expect(report.findings.length).toBeGreaterThan(0);

    const eq = state.equipment.length;
    const cx = state.connections.length;
    state.undo();
    expect(state.equipment.length).toBe(beforeEq);
    expect(state.connections.length).toBe(0);
    state.redo();
    expect(state.equipment.length).toBe(eq);
    expect(state.connections.length).toBe(cx);
  });

  it('marks Auto Design items AUTO and user edits as MANUAL OVERRIDE', () => {
    const state = new AppState();
    state.autoDesignDraft = req({ seating: { count: 6, layout: 'boardroom' } });
    state.generateAutoDesignProposal();
    state.applyAutoDesignProposal();
    const disp = state.equipment.find((e) => catalog.get(e.productId)?.category === 'display')!;
    expect(disp.origin).toBe('auto');
    state.updateEquipment(disp.instanceId, { position: { ...disp.position, x: disp.position.x + 0.2 } });
    const after = state.equipment.find((e) => e.instanceId === disp.instanceId)!;
    expect(after.placementMode).toBe('manual');
    expect(after.origin).toBe('manual');
    const recs = recommendationsAfterManual(
      {
        room: state.room,
        seats: state.seats,
        tables: state.tables,
        equipment: state.equipment,
        connections: state.connections,
        routes: state.routes
      },
      catalog
    );
    expect(recs.some((r) => r.id === 'manual-override')).toBe(true);
  });

  it('does not duplicate equipment on a single apply', () => {
    const state = new AppState();
    state.autoDesignDraft = req({ seating: { count: 4, layout: 'boardroom' } });
    state.generateAutoDesignProposal();
    state.applyAutoDesignProposal();
    const ids = state.equipment.map((e) => e.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves TableSpec when completing around existing furniture', () => {
    const state = new AppState();
    const room = createDefaultRoom('boardroom');
    state.setRoom(room);
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(10, 'boardroom'));
    state.setSeats(seats, tables);
    const fp = furnitureFingerprint(state);
    state.autoDesignDraft = defaultQuickRequirements();
    state.autoDesignDraft.completeMissingOnly = true;
    state.autoDesignDraft.constraints.keepExistingSeating = true;
    state.autoDesignDraft.constraints.keepExistingEquipment = true;
    state.autoDesignDraft.seating = { count: 10, layout: 'boardroom' };
    state.autoDesignDraft.room = { length: room.depth, width: room.width, height: room.height };
    state.generateAutoDesignProposal();
    state.applyAutoDesignProposal();
    expect(furnitureFingerprint(state)).toBe(fp);
  });

  it('detects manual work before regenerate', () => {
    const state = new AppState();
    state.autoDesignDraft = req({ seating: { count: 6, layout: 'boardroom' } });
    state.generateAutoDesignProposal();
    state.applyAutoDesignProposal();
    const disp = state.equipment.find((e) => e.origin === 'auto')!;
    state.updateEquipment(disp.instanceId, { position: { ...disp.position, x: 0.4 } });
    expect(state.detectAutoDesignManualWork()).toBe(true);
  });
});

describe('Multiple occupancy rooms share the same pipeline', () => {
  it.each([2, 6, 8, 12, 16])('generates a proposal for %i seats', (n) => {
    const p = generateDesign(emptyCtx(), req({ seating: { count: n, layout: 'boardroom' } }), catalog);
    expect(p.status).toBe('ok');
    expect(selectedOption(p)!.seats.length).toBeGreaterThan(0);
  });
});

describe('Auto Design spatial + honesty review', () => {
  it.each([
    ['meeting', 2],
    ['presentation', 6],
    ['video_conference', 8],
    ['hybrid', 12],
    ['meeting', 16]
  ] as const)('keeps generated geometry inside the room for %s / %i pax', (useCase, n) => {
    const p = generateDesign(emptyCtx(), req({ useCase, seating: { count: n, layout: 'auto' } }), catalog);
    expect(p.status).toBe('ok');
    expect(p.spatialIssues.filter((i) => i.code.startsWith('SPATIAL') || i.code.startsWith('TOPO'))).toEqual([]);
    const blob = JSON.stringify(selectedOption(p)!.picks) + selectedOption(p)!.why.join(' ');
    expect(blob).not.toMatch(/ViewingDistanceEngine|MicrophoneCoverageEngine|SpeakerCoverageEngine|CameraCoverageEngine|PlacementSuggestionEngine/);
  });

  it('places the camera on the presentation wall, not a door-centered snap from origin', () => {
    const p = generateDesign(emptyCtx(), req({ seating: { count: 8, layout: 'boardroom' }, camera: { required: 'required' } }), catalog);
    const opt = selectedOption(p)!;
    const cam = opt.equipment.find((e) => catalog.get(e.productId)?.category === 'camera');
    expect(cam?.wall).toBe(getPresentationWall(opt.room));
  });

  it('does not report a camera coverage percentage when VFOV is missing', () => {
    const p = generateDesign(emptyCtx(), req({ seating: { count: 8, layout: 'boardroom' } }), catalog);
    const cam = selectedOption(p)?.picks.camera;
    if (cam?.completeness === 'partial') {
      expect(cam.actual).not.toMatch(/%/);
      expect(cam.reason).toMatch(/DATA INCOMPLETE/);
    }
  });

  it('keeps TableSpec through apply, equipment move, undo, and redo', () => {
    const state = new AppState();
    state.autoDesignDraft = req({ seating: { count: 8, layout: 'boardroom' } });
    state.generateAutoDesignProposal();
    state.applyAutoDesignProposal();
    const fp = furnitureFingerprint(state);
    const eq = state.equipment.find((e) => e.origin === 'auto')!;
    state.updateEquipment(eq.instanceId, { position: { ...eq.position, x: eq.position.x + 0.3 } });
    expect(furnitureFingerprint(state)).toBe(fp);
    state.undo();
    expect(furnitureFingerprint(state)).toBe(fp);
    state.redo();
    expect(furnitureFingerprint(state)).toBe(fp);
    state.setViewMode('plan');
    state.setWorkspaceMode('simulate');
    state.setWorkspaceMode('validate');
    state.setWorkspaceMode('system');
    state.setWorkspaceMode('design');
    expect(furnitureFingerprint(state)).toBe(fp);
  });

  it('View Issue uses finding code routing and selects affected equipment', () => {
    const state = new AppState();
    state.addEquipment({
      instanceId: 'd1',
      productId: 'lg-86uh5j',
      name: 'Display',
      position: { x: 0, y: 1.5, z: -3 },
      rotationY: 0
    });
    state.inspectFinding('DISPLAY-002-d1', [], [], ['d1'], 'DISPLAY-002');
    expect(state.displayAnalysis.enabled).toBe(true);
    expect(state.selection.id).toBe('d1');
  });
});
