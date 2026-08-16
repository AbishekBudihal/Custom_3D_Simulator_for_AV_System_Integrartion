import { describe, it, expect } from 'vitest';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { loadDefaultCatalog } from '../../src/catalog/loadCatalog';
import { evaluatePlacement } from '../../src/av/PlacementFeedback';
import { snapEquipment } from '../../src/interaction/SnapEngine';

const catalog = loadDefaultCatalog();

describe('Placement feedback and mounting', () => {
  it('warns when a ceiling-only speaker sits at floor height', () => {
    const room = createDefaultRoom('conference');
    const speaker = catalog.all().find((p) => p.speaker?.mount === 'ceiling')!;
    const note = evaluatePlacement(room, [], speaker, { x: 0, y: 0.05, z: 0 });
    expect(note.status).toBe('warning');
    expect(note.note.toLowerCase()).toMatch(/ceiling/);
  });

  it('snaps a ceiling-only speaker to ceiling height instead of leaving it on the floor', () => {
    const room = createDefaultRoom('conference');
    const speaker = catalog.all().find((p) => p.speaker?.mount === 'ceiling')!;
    const snapped = snapEquipment(room, speaker, { x: 0, y: 0.05, z: 0 }, 0);
    expect(snapped.snapKind).toBe('ceiling');
    expect(snapped.position.y).toBeGreaterThan(room.height - 0.5);
  });

  it('flags positions outside the room', () => {
    const room = createDefaultRoom('conference');
    const display = catalog.get('lg-86uh5j')!;
    const note = evaluatePlacement(room, [], display, { x: room.width, y: 1.6, z: 0 });
    expect(note.status).toBe('warning');
    expect(note.note.toLowerCase()).toMatch(/outside/);
  });
});
