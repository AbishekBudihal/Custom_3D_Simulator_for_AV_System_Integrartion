import { describe, it, expect } from 'vitest';
import { applyAlignCommand } from '../../src/interaction/AlignEngine';
import { AppState } from '../../src/app/AppState';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { furnitureFingerprint } from '../../src/app/HistoryManager';
import { defaultSeatingConfig, generateSeating } from '../../src/room/SeatingGenerator';

describe('AlignEngine', () => {
  it('aligns to minimum X (plan left / −X)', () => {
    const out = applyAlignCommand(
      [
        { id: 'a', x: 1, z: 0 },
        { id: 'b', x: 3, z: 2 }
      ],
      'left'
    );
    expect(out.every((i) => i.x === 1)).toBe(true);
    expect(out.find((i) => i.id === 'b')!.z).toBe(2);
  });

  it('distributes along X without moving endpoints', () => {
    const out = applyAlignCommand(
      [
        { id: 'a', x: 0, z: 0 },
        { id: 'b', x: 2, z: 0 },
        { id: 'c', x: 6, z: 0 }
      ],
      'distributeX'
    );
    expect(out.find((i) => i.id === 'a')!.x).toBe(0);
    expect(out.find((i) => i.id === 'c')!.x).toBe(6);
    expect(out.find((i) => i.id === 'b')!.x).toBe(3);
  });
});

describe('UX state vs geometry history', () => {
  it('does not store simulation overlays or hide flags in undo snapshots', () => {
    const state = new AppState();
    state.setRoom(createDefaultRoom('conference'));
    state.addEquipment({
      instanceId: 'd1',
      productId: 'lg-86uh5j',
      name: 'Display',
      position: { x: 0, y: 1.5, z: -3 },
      rotationY: 0
    });
    state.enableDisplayAnalysis();
    state.setDisplayAnalysisView({ heatmap: true });
    state.toggleEquipmentHidden('d1');
    const snap = state.captureSnapshot() as unknown as Record<string, unknown>;
    expect(snap.displayAnalysis).toBeUndefined();
    expect(snap.hiddenEquipmentIds).toBeUndefined();
    expect(snap.cameraAnalysis).toBeUndefined();
    state.undo();
    expect(state.displayAnalysis.heatmap).toBe(true);
    expect(state.hiddenEquipmentIds).toContain('d1');
  });

  it('keeps TableSpec seating after aligning unrelated equipment', () => {
    const state = new AppState();
    const room = createDefaultRoom('boardroom');
    state.setRoom(room);
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(12, 'boardroom'));
    state.setSeats(seats, tables);
    const fp = furnitureFingerprint(state);
    state.addEquipment({
      instanceId: 'a',
      productId: 'qsc-adc6t',
      name: 'A',
      position: { x: 1, y: 2.7, z: 0 },
      rotationY: 0
    });
    state.addEquipment({
      instanceId: 'b',
      productId: 'qsc-adc6t',
      name: 'B',
      position: { x: 3, y: 2.7, z: 1 },
      rotationY: 0
    });
    state.select('equipment', 'a');
    state.select('equipment', 'b', true);
    state.applyAlign('left');
    expect(furnitureFingerprint(state)).toBe(fp);
    expect(state.equipment.find((e) => e.instanceId === 'b')!.position.x).toBe(1);
  });

  it('syncs additional selection with selectedEquipmentIds', () => {
    const state = new AppState();
    state.addEquipment({
      instanceId: 'a',
      productId: 'lg-86uh5j',
      name: 'A',
      position: { x: 0, y: 1.5, z: -3 },
      rotationY: 0
    });
    state.addEquipment({
      instanceId: 'b',
      productId: 'lg-86uh5j',
      name: 'B',
      position: { x: 1, y: 1.5, z: -3 },
      rotationY: 0
    });
    state.select('equipment', 'a');
    state.select('equipment', 'b', true);
    expect(state.selectedEquipmentIds().sort()).toEqual(['a', 'b']);
    state.select('none', null);
    expect(state.selectedEquipmentIds()).toEqual([]);
  });

  it('duplicate and delete operate on geometry history', () => {
    const state = new AppState();
    state.addEquipment({
      instanceId: 'a',
      productId: 'lg-86uh5j',
      name: 'A',
      position: { x: 0, y: 1.5, z: -3 },
      rotationY: 0
    });
    state.select('equipment', 'a');
    state.duplicateSelectedEquipment();
    expect(state.equipment.length).toBe(2);
    state.select('equipment', 'a');
    state.deleteSelected();
    expect(state.equipment.some((e) => e.instanceId === 'a')).toBe(false);
    state.undo();
    expect(state.equipment.some((e) => e.instanceId === 'a')).toBe(true);
  });

  it('enabling heatmap does not by itself turn on sibling overlays', () => {
    const state = new AppState();
    state.setDisplayAnalysisView({ enabled: true, heatmap: true, seatStatus: false, sightlines: 'off' });
    expect(state.displayAnalysis.heatmap).toBe(true);
    expect(state.displayAnalysis.seatStatus).toBe(false);
    expect(state.displayAnalysis.sightlines).toBe('off');
  });
});
