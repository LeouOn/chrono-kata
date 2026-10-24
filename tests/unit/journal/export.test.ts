import { afterEach, describe, expect, it } from 'vitest';
import {
  exportDayMarkdown,
  exportMonthMarkdown,
  exportWeekMarkdown,
  formatLongDate,
  formatMonthLabel,
  quoteBlock,
  weekdayName,
} from '@/lib/journal/export';
import { addDays } from '@/lib/pacing/days';
import { formatWeekLabel } from '@/lib/review/week';
import { renderJournalTemplate } from '@/lib/journal/template';
import type { DayPlan } from '@/lib/schemas/day-plan';
import type { Domain } from '@/lib/schemas/domain';
import type { Task } from '@/lib/schemas/task';

const previousTz = process.env.TZ;
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const TRADING: Domain = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Trading',
  order: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};
const PRACTICE: Domain = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Practice',
  order: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function task(id: string, title: string, status: Task['status'] = 'next'): Task {
  const t = new Date('2026-06-01T00:00:00Z');
  return { id, title, status, source: 'manual', createdAt: t, touchedAt: t, doneAt: status === 'done' ? t : null } as Task;
}

function plan(patch: Partial<DayPlan> & { date: string }): DayPlan {
  const t = new Date('2026-06-01T00:00:00Z');
  return { picks: [], capacityMin: 0, createdAt: t, updatedAt: t, ...patch } as DayPlan;
}

const DONE = task('aaaaaaaa-1111-4111-8111-111111111111', 'Fix the hose', 'done');
const BACK = task('bbbbbbbb-2222-4222-8222-222222222222', 'Write the report');
const PLANNED = task('cccccccc-3333-4333-8333-333333333333', 'Read the chapter');

const MONDAY = plan({
  date: '2026-06-15',
  picks: [DONE.id, BACK.id, PLANNED.id],
  journal: 'Trading felt calm.\n\nPractice was short.',
  shutdownNote: 'Left the trading review for tomorrow.',
  firstActionTomorrow: 'Start with trading prep.',
  picksDone: [DONE.id],
  picksBack: [BACK.id],
  domainChecks: { [TRADING.id]: true, [PRACTICE.id]: false },
});

const INPUT = { plans: [MONDAY], tasks: [DONE, BACK, PLANNED], domains: [TRADING, PRACTICE] };

describe('date labels', () => {
  it('names the local weekday and the long date from the day key', () => {
    expect(weekdayName('2026-06-15')).toBe('Monday');
    expect(weekdayName('2026-06-21')).toBe('Sunday');
    expect(formatLongDate('2026-06-15')).toBe('Monday 15 June 2026');
    expect(formatMonthLabel('2026-06')).toBe('June 2026');
  });
});

describe('a day export', () => {
  it('contains exactly what the person wrote, in sections, with no extras', () => {
    expect(exportDayMarkdown('2026-06-15', INPUT)).toBe(
      [
        '# Monday 15 June 2026',
        '',
        '### Journal',
        '',
        '> Trading felt calm.',
        '>',
        '> Practice was short.',
        '',
        '### What moved',
        '',
        '- [x] Fix the hose',
        '',
        '### Back on the list',
        '',
        '- [ ] Write the report',
        '',
        '### Planned',
        '',
        '- [ ] Read the chapter',
        '',
        '### Domains',
        '',
        '- [x] Trading',
        '- [ ] Practice',
        '',
        '### Shutdown',
        '',
        '> Left the trading review for tomorrow.',
        '',
        "### Tomorrow's first move",
        '',
        '> Start with trading prep.',
      ].join('\n') + '\n',
    );
  });

  it('says so, calmly, for a day with no entry', () => {
    expect(exportDayMarkdown('2026-06-15', { plans: [], tasks: [], domains: [] })).toBe(
      '# Monday 15 June 2026\n\n_No journal entries in this range._\n',
    );
  });

  it('cannot be broken by markdown in the person’s own text', () => {
    const hostile = plan({
      date: '2026-06-15',
      journal: '# not a heading\n```\n---\n| not | a table |\n- not a list',
      firstActionTomorrow: '## also not a heading',
    });
    const out = exportDayMarkdown('2026-06-15', { plans: [hostile], tasks: [], domains: [] });
    const structural = out
      .split('\n')
      .filter((line) => line.startsWith('#') || line.startsWith('```') || line.startsWith('---') || line.startsWith('|'));
    // Only the headings this module generates survive as structure.
    expect(structural).toEqual([
      '# Monday 15 June 2026',
      '### Journal',
      "### Tomorrow's first move",
    ]);
    expect(out).toContain('> # not a heading');
    expect(out).toContain('> ```');
    expect(out).toContain('> ---');
    expect(out).toContain('> | not | a table |');
  });

  it('quotes every line, so blank lines cannot end the quote', () => {
    expect(quoteBlock('a\n\nb')).toBe('> a\n>\n> b');
  });
});

describe('week and month exports', () => {
  it('covers a Monday-based week across a spring-forward DST change', () => {
    process.env.TZ = 'Europe/Helsinki';
    const weekOf = '2026-03-23'; // Monday; the clock jumps on Sunday 2026-03-29
    const plans = Array.from({ length: 7 }, (_, index) =>
      plan({ date: addDays(weekOf, index), journal: `day ${index}` }),
    );
    // A plan on the next Monday belongs to the next week.
    plans.push(plan({ date: addDays(weekOf, 7), journal: 'next week' }));

    const out = exportWeekMarkdown(weekOf, { plans, tasks: [], domains: [] });
    expect(out).toContain(`# Week of ${formatWeekLabel('2026-03-23')}`);
    expect(out).toContain('## Monday 23 March 2026');
    expect(out).toContain('## Sunday 29 March 2026');
    expect(out).not.toContain('day 7');
    expect(out.match(/^## /gm)).toHaveLength(7);
  });

  it('covers a Monday-based week across a fall-back DST change too', () => {
    process.env.TZ = 'Europe/Helsinki';
    const out = exportWeekMarkdown('2026-10-25', {
      plans: [
        plan({ date: '2026-10-19', journal: 'monday' }),
        plan({ date: '2026-10-25', journal: 'sunday' }),
        plan({ date: '2026-10-26', journal: 'next monday' }),
      ],
      tasks: [],
      domains: [],
    });
    expect(out).toContain('## Monday 19 October 2026');
    expect(out).toContain('## Sunday 25 October 2026');
    expect(out).not.toContain('next monday');
  });

  it('uses local day keys in a half-hour zone', () => {
    process.env.TZ = 'Asia/Kolkata';
    const out = exportWeekMarkdown('2026-06-17', {
      plans: [plan({ date: '2026-06-15', journal: 'monday' }), plan({ date: '2026-06-21', journal: 'sunday' })],
      tasks: [],
      domains: [],
    });
    expect(out).toContain(`# Week of ${formatWeekLabel('2026-06-15')}`);
    expect(out).toContain('## Monday 15 June 2026');
    expect(out).toContain('## Sunday 21 June 2026');
  });

  it('covers exactly one calendar month, including a leap February', () => {
    const plans = [
      plan({ date: '2028-01-31', journal: 'january' }),
      plan({ date: '2028-02-01', journal: 'first' }),
      plan({ date: '2028-02-29', journal: 'leap day' }),
      plan({ date: '2028-03-01', journal: 'march' }),
    ];
    const out = exportMonthMarkdown('2028-02-15', { plans, tasks: [], domains: [] });
    expect(out).toContain('# February 2028');
    expect(out).toContain('## Tuesday 1 February 2028');
    expect(out).toContain('## Tuesday 29 February 2028');
    expect(out).not.toContain('january');
    expect(out).not.toContain('march');
  });
});

describe('inline escaping: titles and domain names are external text', () => {
  const HOSTILE = [
    '# Big heading',
    '```js',
    '> quote',
    '---',
    '<b onclick=x>hi</b>',
    '1. numbered',
    '[click](javascript:alert(1))',
    '* * *',
    '+ plus',
    '= equals',
    'tab\there',
    'zero\u200bwidth',
    'trailing backslash\\',
    `long ${'x'.repeat(300)}`,
    '& &amp; &lt;',
    // Bidi controls would let a title visually reverse the text around it.
    'safe\u202Etxet desrever\u202C',
    'isolate\u2067inside\u2069',
  ];

  /** The inverse of escapeInline, for the round-trip assertion. */
  function unescapeInline(escaped: string): string {
    return escaped
      .replace(/\\([\\`*_{}[\]()#+.!|~-])/g, '$1')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  it('cannot turn a task title into structure, and the text survives the round trip', () => {
    for (const title of HOSTILE) {
      const row = task('aaaaaaaa-1111-4111-8111-111111111111', title, 'done');
      const out = exportDayMarkdown('2026-06-15', {
        plans: [plan({ date: '2026-06-15', picks: [row.id], picksDone: [row.id] })],
        tasks: [row],
        domains: [],
      });

      // Every line is one of the shapes this module writes; nothing else can
      // appear because the title lives inside a list item.
      for (const line of out.split('\n')) {
        expect(line, `unexpected line shape for ${JSON.stringify(title)}`).toMatch(
          /^(# .+|## .+|### .+|> .*|>|- \[[ x]\] .*)?$/,
        );
      }
      const item = out.split('\n').find((line) => line.startsWith('- [x] '))!;
      // Flattened onto one line, and no raw HTML can pass through.
      // No raw HTML can pass through, no bidi control survives, and the visible
      // text is recoverable.
      expect(item).not.toContain('<');
      expect(item).not.toMatch(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/);
      const stripped = title.replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
      expect(unescapeInline(item.slice('- [x] '.length))).toBe(stripped.replace(/\s+/g, ' ').trim());
    }
  });

  it('escapes domain names in the export and in the rendered template', () => {
    const hostileDomain = { ...TRADING, name: '# Trading ```' };
    const row = plan({
      date: '2026-06-15',
      journal: 'A normal day.',
      domainChecks: { [hostileDomain.id]: true },
    });
    const out = exportDayMarkdown('2026-06-15', { plans: [row], tasks: [], domains: [hostileDomain] });
    const domainLine = out.split('\n').find((line) => line.startsWith('- [x] Trading') || line.startsWith('- [x] \\#'));
    expect(domainLine).toBeDefined();
    expect(domainLine!.startsWith('- [x] \\#')).toBe(true);
    expect(out).not.toContain('```');

    const rendered = renderJournalTemplate('- [ ] {{domains}}', {
      date: '2026-06-15',
      weekday: 'Monday',
      domains: [hostileDomain],
    });
    expect(rendered).toContain('\\# Trading');
  });
});

describe('determinism and completeness (oracle over generated entries)', () => {
  function seeded(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };
  }

  const random = seeded(20260615);
  const plans: DayPlan[] = [];
  for (let day = 1; day <= 30; day += 1) {
    const date = `2026-06-${String(day).padStart(2, '0')}`;
    const hasEntry = random() < 0.6;
    plans.push(
      plan({
        date,
        journal: hasEntry ? `journal ${day}\nsecond line ${day}` : undefined,
        shutdownNote: random() < 0.3 ? `note ${day}` : undefined,
        // Both domains appear in the ticks, so their order must not leak into
        // the bytes (the export sorts them, whatever order the caller passes).
        domainChecks:
          random() < 0.4 ? { [TRADING.id]: true, [PRACTICE.id]: random() < 0.5 } : undefined,
      }),
    );
  }

  it('produces the same bytes whatever order the rows arrive in', () => {
    const forward = exportMonthMarkdown('2026-06-15', { plans, tasks: [], domains: [TRADING, PRACTICE] });
    const reversed = exportMonthMarkdown('2026-06-15', {
      plans: [...plans].reverse(),
      tasks: [],
      domains: [PRACTICE, TRADING],
    });
    expect(reversed).toBe(forward);
    expect(exportMonthMarkdown('2026-06-15', { plans, tasks: [], domains: [TRADING, PRACTICE] })).toBe(
      forward,
    );
  });

  it('includes every day that has something to say, once, in date order', () => {
    const out = exportMonthMarkdown('2026-06-15', { plans, tasks: [], domains: [TRADING] });
    const withEntry = plans.filter(
      (row) => (row.journal ?? '') !== '' || (row.shutdownNote ?? '') !== '' || row.domainChecks,
    );
    const headings = out.split('\n').filter((line) => line.startsWith('## '));
    expect(headings).toHaveLength(withEntry.length);
    const expectedOrder = [...withEntry].sort((a, b) => a.date.localeCompare(b.date));
    headings.forEach((heading, index) => {
      expect(heading).toContain(formatLongDate(expectedOrder[index]!.date).split(' ').slice(1).join(' '));
    });
  });

  it('renders every journal line quoted, so nothing is lost or reflowed', () => {
    const out = exportMonthMarkdown('2026-06-15', { plans, tasks: [], domains: [] });
    for (const row of plans) {
      if (!row.journal) continue;
      for (const line of row.journal.split('\n')) {
        expect(out).toContain(`> ${line}`);
      }
    }
  });
});
