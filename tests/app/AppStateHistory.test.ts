import { describe, it, expect } from 'vitest';
import { AppState } from '../../src/app/AppState';
import { createDefaultRoom } from '../../src/room/RoomModel';

describe('AppState undo/redo', () => {
  it('restores equipment position after undo', () => {
    const state = new AppState();
    state.setRoom(createDefaultRoom('conference'));
    state.addEquipment({
      instanceId: 'd1',
      productId: 'lg-86',
      name: 'Display',
      position: { x: 0, y: 1.5, z: -3 },
      rotationY: 0
    });

    state.updateEquipment('d1', { position: { x: 1, y: 1.5, z: -3 } });
    expect(state.equipment[0].position.x).toBe(1);

    state.undo();
    expect(state.equipment[0].position.x).toBe(0);

    state.redo();
    expect(state.equipment[0].position.x).toBe(1);
  });

  it('marks manual placement on updateEquipment', () => {
    const state = new AppState();
    state.addEquipment({
      instanceId: 'd1',
      productId: 'lg-86',
      name: 'Display',
      position: { x: 0, y: 1.5, z: -3 },
      rotationY: 0,
      placementMode: 'smart'
    });
    state.updateEquipment('d1', { position: { x: 0.5, y: 1.5, z: -3 } });
    expect(state.equipment[0].placementMode).toBe('manual');
  });
});
