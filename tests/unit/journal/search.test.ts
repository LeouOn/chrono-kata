import { describe, expect, it } from 'vitest';
import { normaliseSearchQuery, searchJournalEntries } from '@/lib/journal/search';
import type { DayPlan } from '@/lib/schemas/day-plan';

function entry(patch: Partial<DayPlan> & { date: string }): DayPlan {
  return {
    picks: [],
    capacityMin: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...patch,
  } as DayPlan;
}

const ENTRIES = [
  entry({ date: '2026-06-15', journal: 'Trading felt calm.\nPractice was short.' }),
  entry({ date: '2026-06-16', shutdownNote: 'Left the trading review for tomorrow.' }),
  entry({ date: '2026-06-17', firstActionTomorrow: 'Start with TRADING prep.' }),
  entry({ date: '2026-06-18', journal: 'Nothing relevant here.' }),
];

describe('normaliseSearchQuery', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(normaliseSearchQuery('  Trading   prep \n')).toBe('trading prep');
    expect(normaliseSearchQuery('   ')).toBe('');
  });
});

describe('searchJournalEntries', () => {
  it('matches case-insensitively across journal, shutdown note and first action', () => {
    const hits = searchJournalEntries(ENTRIES, 'trading');
    expect(hits.map((hit) => hit.date)).toEqual(['2026-06-17', '2026-06-16', '2026-06-15']);
    expect(hits[0]?.fields).toEqual(['firstAction']);
    expect(hits[1]?.fields).toEqual(['shutdown']);
    expect(hits[2]?.fields).toEqual(['journal']);
  });

  it('reports every field that matched for one day', () => {
    const entryAll = entry({
      date: '2026-06-19',
      journal: 'practice plan',
      shutdownNote: 'practice done',
      firstActionTomorrow: 'practice again',
    });
    expect(searchJournalEntries([entryAll], 'practice')[0]?.fields).toEqual([
      'journal',
      'shutdown',
      'firstAction',
    ]);
  });

  it('returns newest first, whatever order the entries arrive in', () => {
    const forward = searchJournalEntries(ENTRIES, 'trading').map((hit) => hit.date);
    const reversed = searchJournalEntries([...ENTRIES].reverse(), 'trading').map((hit) => hit.date);
    expect(reversed).toEqual(forward);
  });

  it('matches nothing for an empty query: searching for nothing is not a match', () => {
    expect(searchJournalEntries(ENTRIES, '   ')).toEqual([]);
  });

  it('matches nothing when the text has no such phrase', () => {
    expect(searchJournalEntries(ENTRIES, 'kata')).toEqual([]);
  });

  it('keeps the preview on one line and bounded', () => {
    const long = entry({
      date: '2026-06-20',
      journal: `${'a '.repeat(200)}needle ${'b '.repeat(200)}`,
    });
    const hit = searchJournalEntries([long], 'needle')[0]!;
    expect(hit.preview).toContain('needle');
    expect(hit.preview).not.toContain('\n');
    expect(hit.preview.length).toBeLessThanOrEqual(122); // 120 + two ellipses
  });

  it('walks a realistic corpus without missing a match (oracle by count)', () => {
    const corpus: DayPlan[] = [];
    for (let day = 1; day <= 31; day += 1) {
      const date = `2026-05-${String(day).padStart(2, '0')}`;
      corpus.push(
        entry({
          date,
          journal: day % 3 === 0 ? `entry ${day} about trading` : `entry ${day}`,
          shutdownNote: day % 5 === 0 ? 'trading review left' : null,
        }),
      );
    }
    const expected = corpus.filter(
      (row) =>
        (row.journal ?? '').toLowerCase().includes('trading') ||
        (row.shutdownNote ?? '').toLowerCase().includes('trading') ||
        (row.firstActionTomorrow ?? '').toLowerCase().includes('trading'),
    ).length;
    expect(searchJournalEntries([...corpus].reverse(), 'TRADING')).toHaveLength(expected);
  });
});
