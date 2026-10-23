/**
 * Overnight waking windows must not drop anchors that live after midnight.
 *
 * The window belongs to the day it starts on, so the part of the window that
 * falls on the next calendar day has to see that day's anchors too — including
 * a midnight-crossing anchor's tail and an anchor that only starts tomorrow.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { computeCapacity } from '@/lib/planning/capacity';
import type { Anchor } from '@/lib/schemas/settings';

const previousTz = process.env.TZ;
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

function inZone(tz: string, run: () => void) {
  process.env.TZ = tz;
  run();
}

function anchor(partial: Partial<Anchor> = {}): Anchor {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Anchor',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    start: '02:00',
    end: '04:00',
    ...partial,
  };
}

describe('overnight waking window', () => {
  it('counts an anchor that starts after midnight (next calendar day)', () => {
    inZone('America/Los_Angeles', () => {
      const result = computeCapacity({
        day: '2026-06-15',
        wakingHours: { start: '22:00', end: '07:00' },
        fixedBlocks: [],
        anchors: [anchor()], // 02:00-04:00, which lands on 2026-06-16 inside the window
      });
      expect(result.wakingMin).toBe(540);
      expect(result.anchorMin).toBe(120);
      expect(result.freeMin).toBe(420);
    });
  });

  it('counts a midnight-crossing anchor inside an overnight window once', () => {
    inZone('America/Los_Angeles', () => {
      const result = computeCapacity({
        day: '2026-06-15',
        wakingHours: { start: '22:00', end: '07:00' },
        fixedBlocks: [],
        anchors: [anchor({ start: '23:00', end: '02:00' })],
      });
      expect(result.anchorMin).toBe(180);
    });
  });

  it('counts the real minutes of a post-midnight anchor on a spring-forward day', () => {
    inZone('America/Los_Angeles', () => {
      // Window: 2026-03-07 22:00 -> 2026-03-08 07:00. Tomorrow's 02:00-04:00
      // anchor loses the nonexistent 02:00 hour: 03:00 -> 04:00 = 60 minutes.
      const result = computeCapacity({
        day: '2026-03-07',
        wakingHours: { start: '22:00', end: '07:00' },
        fixedBlocks: [],
        anchors: [anchor()],
      });
      expect(result.wakingMin).toBe(480);
      expect(result.anchorMin).toBe(60);
    });
  });

  it('counts the real minutes of a post-midnight anchor on a fall-back day', () => {
    inZone('America/Los_Angeles', () => {
      // Window: 2026-10-31 22:00 -> 2026-11-01 07:00 (25 real hours minus the
      // 15h before 22:00 = 10h). The 01:00-03:00 anchor repeats 01:00, so it is
      // 180 real minutes.
      const result = computeCapacity({
        day: '2026-10-31',
        wakingHours: { start: '22:00', end: '07:00' },
        fixedBlocks: [],
        anchors: [anchor({ start: '01:00', end: '03:00' })],
      });
      expect(result.wakingMin).toBe(600);
      expect(result.anchorMin).toBe(180);
    });
  });

  it('works on a Helsinki DST-change night too', () => {
    inZone('Europe/Helsinki', () => {
      // 2026-03-28 22:00 -> 2026-03-29 07:00 is 8h; the 03:00-05:00 anchor of
      // the 29th loses the nonexistent 03:00 hour.
      const result = computeCapacity({
        day: '2026-03-28',
        wakingHours: { start: '22:00', end: '07:00' },
        fixedBlocks: [],
        anchors: [anchor({ start: '03:00', end: '05:00' })],
      });
      expect(result.wakingMin).toBe(480);
      expect(result.anchorMin).toBe(60);
    });
  });
});

describe('buffer clamping', () => {
  it('clamps a negative buffer to zero instead of inflating capacity', () => {
    const result = computeCapacity({
      day: '2026-06-15',
      wakingHours: { start: '09:00', end: '17:00' },
      fixedBlocks: [],
      anchors: [],
      bufferPct: -20,
    });
    expect(result.bufferMin).toBe(0);
    expect(result.capacityMin).toBe(480);
  });

  it('clamps an over-100 buffer to the whole free time', () => {
    const result = computeCapacity({
      day: '2026-06-15',
      wakingHours: { start: '09:00', end: '17:00' },
      fixedBlocks: [],
      anchors: [],
      bufferPct: 150,
    });
    expect(result.bufferMin).toBe(480);
    expect(result.capacityMin).toBe(0);
  });

  it('falls back to 25 for a non-finite buffer', () => {
    const result = computeCapacity({
      day: '2026-06-15',
      wakingHours: { start: '09:00', end: '17:00' },
      fixedBlocks: [],
      anchors: [],
      bufferPct: Number.NaN,
    });
    expect(result.bufferMin).toBe(120);
    expect(result.capacityMin).toBe(360);
  });
});
