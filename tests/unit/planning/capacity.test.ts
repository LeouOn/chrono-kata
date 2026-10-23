import { describe, it, expect } from 'vitest';
import { computeCapacity, unionMinutes } from '@/lib/planning/capacity';
import { localWallClockToEpoch } from '@/lib/planning/time';
import type { Anchor } from '@/lib/schemas/settings';

const waking = { start: '07:00', end: '22:00' };

function anchor(partial: Partial<Anchor> = {}): Anchor {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Trading session',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    start: '09:00',
    end: '11:00',
    ...partial,
  };
}

function block(day: string, start: string, end: string) {
  return {
    start: new Date(localWallClockToEpoch(day, start)),
    end: new Date(localWallClockToEpoch(day, end)),
  };
}

describe('unionMinutes', () => {
  it('counts overlaps once', () => {
    const spans = [
      { start: 0, end: 60 * 60_000 },
      { start: 30 * 60_000, end: 90 * 60_000 },
      { start: 120 * 60_000, end: 150 * 60_000 },
    ];
    // 0-90 overlaps into one span, then 120-150 is separate: 90 + 30.
    expect(unionMinutes(spans)).toBe(120);
  });

  it('ignores empty spans', () => {
    expect(unionMinutes([])).toBe(0);
    expect(unionMinutes([{ start: 10, end: 10 }])).toBe(0);
  });
});

describe('computeCapacity', () => {
  it('computes a plain day', () => {
    const result = computeCapacity({
      day: '2026-06-15',
      wakingHours: waking,
      fixedBlocks: [block('2026-06-15', '09:00', '10:00')],
      anchors: [],
    });

    expect(result.wakingMin).toBe(900); // 07:00-22:00
    expect(result.fixedMin).toBe(60);
    expect(result.anchorMin).toBe(0);
    expect(result.freeMin).toBe(840);
    expect(result.bufferMin).toBe(210); // 25% of the free time
    expect(result.capacityMin).toBe(630);
  });

  it('unions overlapping fixed blocks instead of summing them', () => {
    const result = computeCapacity({
      day: '2026-06-15',
      wakingHours: waking,
      fixedBlocks: [
        block('2026-06-15', '09:00', '10:30'),
        block('2026-06-15', '10:00', '11:00'),
      ],
      anchors: [],
    });

    expect(result.fixedMin).toBe(120);
    expect(result.freeMin).toBe(780);
  });

  it('counts an anchor that overlaps a fixed block only once', () => {
    const result = computeCapacity({
      day: '2026-06-15',
      wakingHours: waking,
      fixedBlocks: [block('2026-06-15', '09:00', '11:00')],
      anchors: [anchor({ start: '10:00', end: '12:00' })],
    });

    expect(result.fixedMin).toBe(120);
    expect(result.anchorMin).toBe(120);
    // Occupied is 09:00-12:00, counted once.
    expect(result.freeMin).toBe(900 - 180);
  });

  it('counts the tail of an anchor that crossed midnight', () => {
    const result = computeCapacity({
      day: '2026-06-15',
      wakingHours: { start: '00:00', end: '12:00' },
      fixedBlocks: [],
      anchors: [anchor({ start: '22:00', end: '02:00' })],
    });

    // The tail from 00:00 to 02:00 belongs to the day.
    expect(result.anchorMin).toBe(120);
  });

  it('counts the tail and the evening start of a midnight-crossing anchor', () => {
    const result = computeCapacity({
      day: '2026-06-15',
      wakingHours: { start: '00:00', end: '23:59' },
      fixedBlocks: [],
      anchors: [anchor({ start: '22:00', end: '02:00' })],
    });

    // 00:00-02:00 (the tail) plus 22:00-23:59 (the start of tonight).
    expect(result.anchorMin).toBe(239);
  });

  it('clamps everything to the waking window', () => {
    const result = computeCapacity({
      day: '2026-06-15',
      wakingHours: { start: '09:00', end: '17:00' },
      fixedBlocks: [block('2026-06-15', '07:00', '20:00')],
      anchors: [anchor({ start: '08:00', end: '18:00' })],
    });

    expect(result.wakingMin).toBe(480);
    // Only the part inside 09:00-17:00 counts.
    expect(result.fixedMin).toBe(480);
    expect(result.anchorMin).toBe(480);
    expect(result.freeMin).toBe(0);
    expect(result.capacityMin).toBe(0);
  });

  it('reports a zero-capacity day as a normal result', () => {
    const result = computeCapacity({
      day: '2026-06-15',
      wakingHours: { start: '09:00', end: '09:30' },
      fixedBlocks: [block('2026-06-15', '09:00', '09:30')],
      anchors: [],
    });

    expect(result.wakingMin).toBe(30);
    expect(result.freeMin).toBe(0);
    expect(result.bufferMin).toBe(0);
    expect(result.capacityMin).toBe(0);
  });

  it('never goes negative', () => {
    const result = computeCapacity({
      day: '2026-06-15',
      wakingHours: { start: '09:00', end: '17:00' },
      fixedBlocks: [block('2026-06-15', '08:00', '18:00')],
      anchors: [],
    });
    expect(result.capacityMin).toBe(0);
    expect(result.freeMin).toBe(0);
  });

  it('measures an overnight waking window by its real elapsed time', () => {
    const result = computeCapacity({
      day: '2026-06-15',
      wakingHours: { start: '22:00', end: '07:00' },
      fixedBlocks: [],
      anchors: [],
    });

    expect(result.wakingMin).toBe(540); // 22:00 -> 07:00 the next morning
    expect(result.capacityMin).toBe(405); // 75% of the free time
  });

  it('gives a daylight-saving day its real elapsed minutes', () => {
    // On a spring-forward morning the day is 23 hours long; on a fall-back
    // morning it is 25 hours long. The waking window is measured the same way
    // as the day, so it follows the clock.
    const spring = computeCapacity({
      day: '2026-03-08',
      wakingHours: waking,
      fixedBlocks: [],
      anchors: [],
    });
    const fall = computeCapacity({
      day: '2026-11-01',
      wakingHours: waking,
      fixedBlocks: [],
      anchors: [],
    });

    // Both are inside the same wall-clock window, so the elapsed time is the
    // same unless the transition happens inside the window.
    expect(spring.wakingMin).toBeGreaterThan(0);
    expect(fall.wakingMin).toBeGreaterThan(0);
  });

  it('uses the default buffer of 25% of the free time', () => {
    const withDefault = computeCapacity({
      day: '2026-06-15',
      wakingHours: waking,
      fixedBlocks: [],
      anchors: [],
    });
    const explicit = computeCapacity({
      day: '2026-06-15',
      wakingHours: waking,
      fixedBlocks: [],
      anchors: [],
      bufferPct: 25,
    });
    expect(withDefault).toEqual(explicit);
  });
});
