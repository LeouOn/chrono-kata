import { describe, expect, it } from 'vitest';
import {
  analyzeLoadResponse,
  buildTimelineDays,
  countStoppedAtCapThisMonth,
  formatShortDate,
  getCorrelationCaption,
} from '@/lib/insights/load-response';
import { DEFAULT_DEMO_DATA } from '@/lib/pacing/seed-data';
import type { CheckIn } from '@/lib/schemas/check-in';
import type { KataTemplate } from '@/lib/schemas/kata-template';
import type { Session } from '@/lib/schemas/session';

describe('load-response insights helpers', () => {
  describe('formatShortDate', () => {
    it('formats YYYY-MM-DD cleanly', () => {
      const formatted = formatShortDate('2026-09-25');
      expect(formatted).toMatch(/Sep 25/);
    });

    it('returns raw string for invalid format', () => {
      expect(formatShortDate('invalid')).toBe('invalid');
    });
  });

  describe('buildTimelineDays', () => {
    const template: KataTemplate = {
      id: 't1',
      name: 'Forms Practice',
      mode: 'timed',
      intensity: 2,
      icon: '🥋',
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const session: Session = {
      id: 's1',
      startedAt: new Date(2026, 8, 25, 10, 0),
      durationMinutes: 20, // load = 40
      rating: 4,
      activityLabel: 'Forms Practice',
      kataTemplateId: 't1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const checkIns: CheckIn[] = [
      {
        date: '2026-09-25',
        energy: 2,
        fog: 3,
        aches: 3,
        sleep: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        date: '2026-09-26',
        energy: 4,
        fog: 1,
        aches: 1,
        sleep: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('generates the specified number of consecutive days ending at endDate', () => {
      const days = buildTimelineDays([session], checkIns, [template], 3, '2026-09-26');
      expect(days).toHaveLength(3);
      expect(days.map((d) => d.date)).toEqual(['2026-09-24', '2026-09-25', '2026-09-26']);
    });

    it('accurately attaches load, next-day wellbeing, rest, and low energy indicators', () => {
      const days = buildTimelineDays([session], checkIns, [template], 2, '2026-09-26');
      const day25 = days.find((d) => d.date === '2026-09-25')!;
      const day26 = days.find((d) => d.date === '2026-09-26')!;

      expect(day25.load).toBe(40);
      expect(day25.isRestDay).toBe(false);
      expect(day25.isLowEnergyDay).toBe(true); // energy was 2
      expect(day25.hasCheckIn).toBe(true);
      expect(day25.hasNextDayCheckIn).toBe(true);
      expect(day25.nextDayWellbeing).not.toBeNull();

      expect(day26.load).toBe(0);
      expect(day26.isRestDay).toBe(true);
      expect(day26.isLowEnergyDay).toBe(false);
      expect(day26.nextDayWellbeing).toBeNull(); // no check-in for Sep 27
    });

    it('handles empty sessions and check-ins gracefully', () => {
      const days = buildTimelineDays([], [], [], 5, '2026-09-28');
      expect(days).toHaveLength(5);
      expect(days.every((d) => d.load === 0 && d.isRestDay && d.nextDayWellbeing === null)).toBe(true);
    });
  });

  describe('countStoppedAtCapThisMonth', () => {
    it('counts sessions stopped at cap for the given month', () => {
      const sessions: Session[] = [
        {
          id: '1',
          startedAt: new Date(2026, 8, 10), // Sep 2026
          stoppedAtCap: true,
          durationMinutes: 20,
          rating: 4,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          startedAt: new Date(2026, 8, 12), // Sep 2026
          stoppedAtCap: false,
          durationMinutes: 20,
          rating: 4,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          startedAt: new Date(2026, 8, 15), // Sep 2026
          stoppedAtCap: true,
          durationMinutes: 20,
          rating: 4,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '4',
          startedAt: new Date(2026, 7, 28), // Aug 2026 (different month)
          stoppedAtCap: true,
          durationMinutes: 20,
          rating: 4,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = countStoppedAtCapThisMonth(sessions, new Date(2026, 8, 20));
      expect(result.count).toBe(2);
      expect(result.total).toBe(3);
    });
  });

  describe('getCorrelationCaption', () => {
    it('formats inverse, mild, and neutral correlations with caveats', () => {
      expect(getCorrelationCaption({ n: 0, spearman: null, pearson: null }, 1)).toContain('Not enough');
      expect(getCorrelationCaption({ n: 20, spearman: -0.5, pearson: -0.45 }, 1)).toContain('Inverse trend');
      expect(getCorrelationCaption({ n: 20, spearman: -0.2, pearson: -0.18 }, 2)).toContain('Mild inverse trend');
      expect(getCorrelationCaption({ n: 20, spearman: 0.05, pearson: 0.02 }, 1)).toContain('Neutral relationship');
      expect(getCorrelationCaption({ n: 20, spearman: 0.35, pearson: 0.3 }, 1)).toContain('Positive trend');
    });
  });

  describe('analyzeLoadResponse with Demo Data', () => {
    it('analyzes demo dataset with full timeline and statistics', () => {
      const { sessions, checkIns, templates, referenceDate } = DEFAULT_DEMO_DATA;
      const analysis = analyzeLoadResponse(sessions, checkIns, templates, {
        daysCount: 30,
        endDate: referenceDate,
        lag: 1,
        now: new Date('2026-09-28T12:00:00Z'),
      });

      expect(analysis.timelineDays).toHaveLength(30);
      expect(analysis.pairs.length).toBe(35);
      expect(analysis.correlation.spearman).toBeLessThan(-0.3);
      expect(analysis.envelope).not.toHaveProperty('insufficientData');
      expect(analysis.stoppedAtCapMonthCount).toBeGreaterThan(0);
      expect(analysis.maxDailyLoad).toBeGreaterThan(30);
    });
  });
});
