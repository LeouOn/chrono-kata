import { afterEach, describe, expect, it } from 'vitest';
import { anchorsWithinWindow } from '@/lib/planning/anchors';
import { computeCapacity } from '@/lib/planning/capacity';
import { wakingWindow } from '@/lib/planning/time';
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
    start: '09:00',
    end: '11:00',
    ...partial,
  };
}

describe('anchorsWithinWindow', () => {
  it('clips an anchor that extends past the waking window', () => {
    inZone('UTC', () => {
      const day = '2026-06-15';
      const window = wakingWindow(day, { start: '09:00', end: '17:00' });
      const [piece] = anchorsWithinWindow([anchor({ start: '10:00', end: '12:00' })], day, window);
      expect(piece).toBeDefined();
      expect((piece!.end.getTime() - piece!.start.getTime()) / 60_000).toBe(120);
    });
  });

  it('drops an anchor entirely outside the window', () => {
    inZone('UTC', () => {
      const day = '2026-06-15';
      const window = wakingWindow(day, { start: '09:00', end: '17:00' });
      expect(anchorsWithinWindow([anchor({ start: '05:00', end: '07:00' })], day, window)).toEqual([]);
    });
  });

  it('includes an anchor that starts after midnight inside an overnight window', () => {
    inZone('UTC', () => {
      const day = '2026-06-15';
      const window = wakingWindow(day, { start: '22:00', end: '02:00' });
      const pieces = anchorsWithinWindow([anchor({ start: '00:30', end: '01:30' })], day, window);
      const afterMidnight = pieces.find(
        (piece) => piece.start.getHours() === 0 && piece.start.getMinutes() === 30,
      );
      expect(afterMidnight).toBeDefined();
      expect((afterMidnight!.end.getTime() - afterMidnight!.start.getTime()) / 60_000).toBe(60);
    });
  });

  it('keeps real minutes on a fall-back night', () => {
    inZone('America/Los_Angeles', () => {
      // Tail of an 00:30-02:30 anchor on 2026-11-01: the repeated hour adds 60
      // real minutes.
      const day = '2026-11-01';
      const window = wakingWindow(day, { start: '00:00', end: '04:00' });
      const pieces = anchorsWithinWindow([anchor({ start: '00:30', end: '02:30' })], day, window);
      const tail = pieces.find((piece) => piece.start.getHours() === 0 && piece.start.getMinutes() === 30);
      expect(tail).toBeDefined();
      expect((tail!.end.getTime() - tail!.start.getTime()) / 60_000).toBe(180);
    });
  });

  it('feeds the same intervals to capacity', () => {
    inZone('UTC', () => {
      const day = '2026-06-15';
      const anchors = [anchor({ start: '10:00', end: '12:00' })];
      const window = wakingWindow(day, { start: '09:00', end: '17:00' });
      const pieces = anchorsWithinWindow(anchors, day, window);
      const anchorMin = pieces.reduce(
        (sum, piece) => sum + Math.round((piece.end.getTime() - piece.start.getTime()) / 60_000),
        0,
      );
      const capacity = computeCapacity({
        day,
        wakingHours: { start: '09:00', end: '17:00' },
        fixedBlocks: [],
        anchors,
      });
      expect(capacity.anchorMin).toBe(anchorMin);
    });
  });
});
