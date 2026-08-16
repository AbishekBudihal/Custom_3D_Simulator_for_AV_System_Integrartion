import { describe, it, expect } from 'vitest';
import { createDefaultRoom, type RoomModel } from '../../src/room/RoomModel';
import { suggestDisplayPlacement, centerDisplayOnWall } from '../../src/av/PlacementSuggestionEngine';
import { computeWallCandidates, worldToWallOffset } from '../../src/room/RoomGeometry';
import type { EquipmentProduct } from '../../src/catalog/EquipmentCatalog';

const display86: EquipmentProduct = {
  id: 'disp-86',
  manufacturer: 'Acme',
  model: 'AC-86',
  category: 'display',
  type: 'display',
  physical: { width: 1.9, height: 1.1, depth: 0.06 },
  display: { diagonalInches: 86, resolution: '4K', aspectRatio: '16:9', brightnessNits: 500 },
  mounting: { wall: true, floor: false, ceiling: false },
  provenance: 'estimated'
};

function bareRoom(overrides: Partial<RoomModel> = {}): RoomModel {
  const r = createDefaultRoom('conference');
  return { ...r, openings: [], columns: [], ...overrides };
}

/** True if [aStart,aEnd] and [bStart,bEnd] overlap at all. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

describe('DisplayPlacement — Test 1: display can never occupy a door', () => {
  it('does not intersect a door exclusion zone even when the door is on the chosen presentation wall', () => {
    // Force the presentation wall to be the one with the door, so the
    // "avoid it on this wall" logic (not just "pick a different wall") is
    // what's actually under test.
    const room = bareRoom({
      width: 10,
      depth: 7,
      presentationWall: 'front',
      openings: [{ wall: 'front', offset: 3.6, width: 1.0, height: 2.1, sillHeight: 0, kind: 'door' }]
    });

    const suggestion = suggestDisplayPlacement(room, display86);
    expect(suggestion.wall).toBe('front');

    const alongOffset = worldToWallOffset(room, suggestion.wall, suggestion.position.x, suggestion.position.z);
    const halfWidth = (display86.physical.width + 0.3) / 2; // matches the clearance suggestDisplayPlacement requires
    const doorStart = 3.6 - 0.3;
    const doorEnd = 3.6 + 1.0 + 0.3;

    expect(overlaps(alongOffset - halfWidth, alongOffset + halfWidth, doorStart, doorEnd)).toBe(false);
  });

  it('a manual wall override (centerDisplayOnWall) still avoids the door on that wall', () => {
    const room = bareRoom({
      width: 10,
      depth: 7,
      openings: [{ wall: 'right', offset: 2.0, width: 1.0, height: 2.1, sillHeight: 0, kind: 'door' }]
    });
    const placement = centerDisplayOnWall(room, display86, 'right');
    const alongOffset = worldToWallOffset(room, 'right', placement.x, placement.z);
    const halfWidth = (display86.physical.width + 0.3) / 2;
    expect(overlaps(alongOffset - halfWidth, alongOffset + halfWidth, 2.0 - 0.3, 2.0 + 1.0 + 0.3)).toBe(false);
  });
});

describe('DisplayPlacement — Test 4: falls back to another wall when the nearest/preferred one is blocked', () => {
  it('moves off a wall whose door leaves no clear span wide enough for the display', () => {
    // Front wall is only 3m wide and the door eats almost all of it —
    // nowhere near the ~2.2m a 1.9m-wide display + clearance needs.
    const room = bareRoom({
      width: 3,
      depth: 5,
      presentationWall: 'front',
      openings: [{ wall: 'front', offset: 0.5, width: 1.8, height: 2.1, sillHeight: 0, kind: 'door' }]
    });

    const candidates = computeWallCandidates(room, display86.physical.width + 0.3, 0);
    const front = candidates.find((c) => c.wall === 'front')!;
    expect(front.valid).toBe(false); // sanity check on the fixture itself

    const suggestion = suggestDisplayPlacement(room, display86);
    expect(suggestion.wall).not.toBe('front');

    const chosen = candidates.find((c) => c.wall === suggestion.wall)!;
    expect(chosen.valid).toBe(true);
  });

  it('never picks a wall purely by array order — front wall is only preferred when it is actually a good option', () => {
    // Every wall has a door except 'left'; even though 'front' comes first
    // in wall-key order, it must lose to 'left'.
    const room = bareRoom({
      width: 8,
      depth: 6,
      openings: [
        { wall: 'front', offset: 1, width: 1.0, height: 2.1, sillHeight: 0, kind: 'door' },
        { wall: 'back', offset: 1, width: 1.0, height: 2.1, sillHeight: 0, kind: 'door' },
        { wall: 'right', offset: 1, width: 1.0, height: 2.1, sillHeight: 0, kind: 'door' }
      ]
    });
    const suggestion = suggestDisplayPlacement(room, display86);
    expect(suggestion.wall).toBe('left');
  });
});

describe('Acceptance scenario (§11): 10x7m conference room, door on one side wall, 86" display', () => {
  it('places the display clear of the door and reports it in the rationale/candidates', () => {
    const room = bareRoom({
      width: 10,
      depth: 7,
      openings: [{ wall: 'right', offset: 3.0, width: 1.0, height: 2.1, sillHeight: 0, kind: 'door' }]
    });

    const suggestion = suggestDisplayPlacement(room, display86);

    // The display must never land on the door wall's obstructed segment,
    // regardless of which wall ends up chosen.
    const chosen = suggestion.candidates.find((c) => c.wall === suggestion.wall)!;
    if (chosen.hasDoor) {
      const alongOffset = worldToWallOffset(room, suggestion.wall, suggestion.position.x, suggestion.position.z);
      const halfWidth = (display86.physical.width + 0.3) / 2;
      expect(overlaps(alongOffset - halfWidth, alongOffset + halfWidth, 3.0 - 0.3, 3.0 + 1.0 + 0.3)).toBe(false);
    }
    // The door wall itself should never be silently treated as door-free.
    const rightCandidate = suggestion.candidates.find((c) => c.wall === 'right')!;
    expect(rightCandidate.hasDoor).toBe(true);
  });
});
