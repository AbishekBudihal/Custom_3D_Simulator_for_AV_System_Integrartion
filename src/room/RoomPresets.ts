/**
 * RoomPresets.ts
 * Starting dimensions per room type. These are reasonable industry
 * defaults (not a published standard) — the engineer can always
 * override them. Marked as such wherever surfaced in the UI.
 */

import type { RoomModel } from './RoomModel';

export interface RoomPreset {
  id: string;
  label: string;
  description: string;
  typicalCapacity: [number, number];
  width: number;
  depth: number;
  height: number;
}

export const ROOM_PRESETS: RoomPreset[] = [
  { id: 'huddle', label: 'Huddle Room', description: 'Small ad-hoc video call space', typicalCapacity: [2, 4], width: 3.0, depth: 2.5, height: 2.6 },
  { id: 'small_meeting', label: 'Small Meeting Room', description: 'Informal team meetings', typicalCapacity: [4, 8], width: 4.5, depth: 3.5, height: 2.8 },
  { id: 'conference', label: 'Medium Conference Room', description: 'Standard video conference room', typicalCapacity: [8, 14], width: 7.0, depth: 5.0, height: 3.0 },
  { id: 'boardroom', label: 'Boardroom', description: 'Executive meeting room', typicalCapacity: [10, 20], width: 9.0, depth: 6.0, height: 3.2 },
  { id: 'training', label: 'Training Room', description: 'Interactive training / workshops', typicalCapacity: [15, 30], width: 10.0, depth: 8.0, height: 3.2 },
  { id: 'classroom', label: 'Classroom', description: 'Instructor-led teaching space', typicalCapacity: [20, 40], width: 12.0, depth: 9.0, height: 3.3 },
  { id: 'lecture_hall', label: 'Lecture Hall', description: 'Large tiered instructional space', typicalCapacity: [50, 120], width: 18.0, depth: 14.0, height: 4.5 },
  { id: 'auditorium', label: 'Auditorium', description: 'Large-scale assembly / presentation venue', typicalCapacity: [100, 400], width: 25.0, depth: 18.0, height: 6.0 }
];

export function applyPreset(room: RoomModel, presetId: string): RoomModel {
  const preset = ROOM_PRESETS.find((p) => p.id === presetId);
  if (!preset) return room;
  return { ...room, width: preset.width, depth: preset.depth, height: preset.height, useCase: presetId };
}
