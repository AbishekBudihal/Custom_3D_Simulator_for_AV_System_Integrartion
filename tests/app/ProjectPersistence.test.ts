import { describe, it, expect } from 'vitest';
import { AppState } from '../../src/app/AppState';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { defaultSeatingConfig, generateSeating } from '../../src/room/SeatingGenerator';
import { loadProjectInto, parseProjectJson, serializeProject } from '../../src/app/ProjectStore';

describe('Project persistence', () => {
  it('round-trips room, seating, equipment, rack, connections, and system layout', () => {
    const state = new AppState();
    const room = createDefaultRoom('conference');
    state.setRoom(room);
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(8, 'conference'));
    state.setSeats(seats, tables);
    state.addEquipment({
      instanceId: 'src',
      productId: 'user-laptop-source',
      name: 'User Laptop',
      position: { x: 0.2, y: 0.75, z: 0.1 },
      rotationY: 0
    });
    state.addEquipment({
      instanceId: 'disp',
      productId: 'lg-86uh5j',
      name: 'LG 86UH5J',
      position: { x: 0, y: 1.6, z: -3 },
      rotationY: 0,
      wall: 'front'
    });
    expect(state.addConnection('src', 'hdmi-out', 'disp', 'hdmi-in-1')).toBe(true);
    state.systemLayout = { src: { x: 40, y: 40 }, disp: { x: 280, y: 40 } };

    const json = JSON.stringify(serializeProject(state));
    const parsed = parseProjectJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const loaded = new AppState();
    const result = loadProjectInto(loaded, parsed.file);
    expect(result.ok).toBe(true);
    expect(loaded.room?.width).toBe(room.width);
    expect(loaded.seats.length).toBe(seats.length);
    expect(loaded.tables.length).toBe(tables.length);
    expect(loaded.equipment.map((e) => e.productId).sort()).toEqual(['lg-86uh5j', 'user-laptop-source']);
    expect(loaded.connections.length).toBe(1);
    expect(loaded.systemLayout.disp).toEqual({ x: 280, y: 40 });
    expect(loaded.canUndo()).toBe(false);
  });

  it('rejects malformed JSON without throwing to the UI', () => {
    expect(parseProjectJson('{not json').ok).toBe(false);
    expect(parseProjectJson('[]').ok).toBe(false);
    expect(parseProjectJson('{"foo":1}').ok).toBe(false);
  });

  it('undo restores a property edit after load is not on the undo stack', () => {
    const state = new AppState();
    state.addEquipment({
      instanceId: 'disp',
      productId: 'lg-86uh5j',
      name: 'Display',
      position: { x: 0, y: 1.5, z: -3 },
      rotationY: 0
    });
    state.updateEquipment('disp', { position: { x: 0.4, y: 1.8, z: -3 } });
    expect(state.equipment[0].position.y).toBe(1.8);
    state.undo();
    expect(state.equipment[0].position.y).toBe(1.5);
  });
});
