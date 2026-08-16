import { describe, it, expect } from 'vitest';
import { AppState } from '../../src/app/AppState';
import { furnitureFingerprint } from '../../src/app/HistoryManager';
import { createDefaultRoom } from '../../src/room/RoomModel';
import { defaultSeatingConfig, generateSeating } from '../../src/room/SeatingGenerator';
import {
  requirementsFromSetup,
  shellNavForWorkspace,
  useCaseForProjectType
} from '../../src/ui/workspace/projectSetup';

describe('Workspace shell — project setup maps to DesignRequirements', () => {
  it('maps project types onto Auto Design use cases without inventing specs', () => {
    expect(useCaseForProjectType('video_conference')).toBe('video_conference');
    expect(useCaseForProjectType('classroom')).toBe('training');
    expect(useCaseForProjectType('boardroom')).toBe('meeting');
    const req = requirementsFromSetup({
      projectType: 'hybrid',
      capacity: 8,
      widthM: 8,
      lengthM: 10,
      heightM: 3
    });
    expect(req.useCase).toBe('hybrid');
    expect(req.seating.count).toBe(8);
    expect(req.room.width).toBe(8);
    expect(req.room.length).toBe(10);
    expect(req.completeMissingOnly).toBe(false);
  });

  it('shell tabs do not rewrite TableSpec', () => {
    const state = new AppState();
    const room = createDefaultRoom('conference');
    state.setRoom(room);
    const { seats, tables } = generateSeating(room, defaultSeatingConfig(8, 'boardroom'));
    state.setSeats(seats, tables);
    const fp = furnitureFingerprint(state);
    state.setShellNav('simulate');
    state.setShellNav('validate');
    state.setShellNav('system');
    state.setShellNav('design');
    state.setUiComplexity('pro');
    expect(furnitureFingerprint(state)).toBe(fp);
    expect(state.tables).toEqual(tables);
  });

  it('Start manually creates a room from setup and closes the overlay', () => {
    const state = new AppState();
    expect(state.setupOpen).toBe(true);
    expect(state.room).toBeNull();
    state.patchSetupDraft({ capacity: 8, widthM: 7, lengthM: 9, heightM: 3, projectType: 'meeting' });
    state.beginFromSetup('manual');
    expect(state.setupOpen).toBe(false);
    expect(state.room?.width).toBe(7);
    expect(state.room?.depth).toBe(9);
    expect(state.shellNav).toBe('project');
    expect(state.autoDesignDraft.seating.count).toBe(8);
  });

  it('workspace mode still drives shell nav', () => {
    expect(shellNavForWorkspace('design', 'room')).toBe('project');
    expect(shellNavForWorkspace('design', 'catalog')).toBe('design');
    expect(shellNavForWorkspace('system', 'catalog')).toBe('system');
  });
});
