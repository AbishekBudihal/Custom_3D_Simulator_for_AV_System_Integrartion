import { describe, it, expect } from 'vitest';
import { generateSeating, defaultSeatingConfig } from '../../src/room/SeatingGenerator';
import { createDefaultRoom } from '../../src/room/RoomModel';

describe('SeatingGenerator', () => {
  it('Scenario A: 10x7m meeting room, 12 seats, boardroom layout', () => {
    const room = { ...createDefaultRoom('boardroom'), width: 10, depth: 7, height: 3.0 };
    const cfg = defaultSeatingConfig(12, 'boardroom');
    const { seats, warnings } = generateSeating(room, cfg);
    expect(seats.length).toBeGreaterThan(0);
    expect(seats.length).toBeLessThanOrEqual(12);
    // all seats inside room bounds
    seats.forEach((s) => {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(room.width / 2 + 0.01);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(room.depth / 2 + 0.01);
    });
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('Scenario B: 16x12m classroom, 40 seats', () => {
    const room = { ...createDefaultRoom('classroom'), width: 16, depth: 12, height: 3.3 };
    const cfg = defaultSeatingConfig(40, 'classroom');
    const { seats } = generateSeating(room, cfg);
    expect(seats.length).toBeGreaterThan(0);
    // unique seat IDs
    const ids = new Set(seats.map((s) => s.id));
    expect(ids.size).toBe(seats.length);
  });

  it('Scenario C: 25x18m auditorium, 100+ seats (theater layout)', () => {
    const room = { ...createDefaultRoom('auditorium'), width: 25, depth: 18, height: 6.0 };
    const cfg = { ...defaultSeatingConfig(120, 'theater'), rowPitch: 1.0, seatWidth: 0.55 };
    const { seats, warnings } = generateSeating(room, cfg);
    expect(seats.length).toBeGreaterThan(50);
    seats.forEach((s) => expect(s.hasTable).toBe(false));
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('reports a shortfall warning when capacity cannot physically fit', () => {
    const room = { ...createDefaultRoom('huddle'), width: 3, depth: 2.5, height: 2.6 };
    const cfg = defaultSeatingConfig(50, 'classroom');
    const { seats, warnings } = generateSeating(room, cfg);
    expect(seats.length).toBeLessThan(50);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
