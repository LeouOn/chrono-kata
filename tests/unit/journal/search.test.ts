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

  it('finds a multi-word query across a line break or a double space', () => {
    const multi = entry({
      date: '2026-06-21',
      journal: 'Worked on position\nsizing today.\n\nAlso  double  spaced words.',
    });
    expect(searchJournalEntries([multi], 'position sizing')).toHaveLength(1);
    expect(searchJournalEntries([multi], 'double spaced')).toHaveLength(1);
    expect(searchJournalEntries([multi], 'position')).toHaveLength(1);
    expect(searchJournalEntries([multi], 'position TEXT')).toHaveLength(0);
    expect(searchJournalEntries([multi], '   ')).toEqual([]);
  });

  it('finds every substring of the collapsed text (oracle over random multi-line entries)', () => {
    let state = 424242;
    const random = () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };
    const words = ['trading', 'practice', 'note', 'calm', 'short', 'review', 'Kata', 'deep', 'work'];

    for (let round = 0; round < 40; round += 1) {
      const lines = Array.from({ length: 1 + Math.floor(random() * 4) }, () =>
        Array.from({ length: 1 + Math.floor(random() * 4) }, () => words[Math.floor(random() * words.length)]).join(
          random() < 0.5 ? ' ' : '  ',
        ),
      );
      const journal = lines.join(random() < 0.5 ? '\n' : '\n\n');
      const entryRow = entry({ date: '2026-06-22', journal });
      const collapsed = journal.replace(/\s+/g, ' ').trim();

      for (let trial = 0; trial < 6; trial += 1) {
        const start = Math.floor(random() * Math.max(1, collapsed.length - 1));
        const length = 1 + Math.floor(random() * Math.min(12, collapsed.length - start));
        const needle = collapsed.slice(start, start + length).trim();
        if (needle === '') continue;
        const query = random() < 0.5 ? needle : needle.toUpperCase();
        expect(searchJournalEntries([entryRow], query), `substring ${JSON.stringify(needle)}`).toHaveLength(1);
      }

      // A string the text does not contain is not found.
      const absent = `qq${'z'.repeat(3)}`;
      if (!collapsed.includes(absent)) {
        expect(searchJournalEntries([entryRow], absent)).toEqual([]);
      }
    }
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
