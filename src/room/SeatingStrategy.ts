/**
 * Chooses a seating strategy from room characteristics.
 * Does not hard-code "N seats = two tables".
 */

import type { RoomModel } from './RoomModel';
import type { SeatingLayout } from './SeatingGenerator';
import { conferenceWidthForCapacity } from './FurnitureCatalog';
import type { DesignUseCase } from '../autodesign/DesignRequirements';

export function conferenceEnvelopeFits(room: RoomModel, capacity: number): boolean {
  const n = capacity;
  const tableW = conferenceWidthForCapacity(n);
  const spacing = 0.65;
  const perLong = Math.max(2, Math.ceil((n <= 6 ? n : n - 2) / 2));
  const tableL = perLong * spacing + 0.28;
  const halfW = tableW / 2 + 0.4 + 0.45 + 0.7;
  const depthNeed = 1.6 + tableL + 0.45 + 0.7;
  return halfW * 2 <= room.width - 0.1 && depthNeed <= room.depth - 0.1;
}

export function resolveSeatingLayout(
  room: RoomModel,
  capacity: number,
  requested: SeatingLayout | 'auto',
  useCase?: DesignUseCase
): SeatingLayout {
  if (requested !== 'auto') return requested;
  if (room.divisible) return 'flexible';
  if (useCase === 'training' || useCase === 'presentation') {
    return capacity >= 18 || room.width * room.depth > 80 ? 'flexible' : 'classroom';
  }
  const area = room.width * room.depth;
  if (capacity <= 12 && conferenceEnvelopeFits(room, capacity)) return 'boardroom';
  if (capacity >= 16 && area >= 70) return 'flexible';
  if (conferenceEnvelopeFits(room, capacity)) return 'boardroom';
  return 'flexible';
}
