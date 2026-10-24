import { afterEach, describe, expect, it } from 'vitest';
import { rankPicks, cadenceDebt, DEFAULT_TASK_MINUTES, MAX_PICKS, MAX_PICKS_PER_PROJECT } from '@/lib/planning/rank-picks';
import type { AnchorInterval } from '@/lib/planning/anchors';
import { TaskSchema, type Task } from '@/lib/schemas/task';
import { ProjectSchema, type Project } from '@/lib/schemas/project';
import { SessionSchema, type Session } from '@/lib/schemas/session';
import { localWallClockToEpoch } from '@/lib/planning/time';

const NOW = new Date(2026, 5, 15, 9, 0);

const previousTz = process.env.TZ;
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

function inZone(tz: string, run: () => void) {
  process.env.TZ = tz;
  run();
}
const GUILT = /overdue|late\b|behind|missed|failed|should have/i;

let seq = 0;
function task(partial: Partial<Task> = {}): Task {
  seq += 1;
  return TaskSchema.parse({
    id: `11111111-1111-4111-8111-${String(seq).padStart(12, '0')}`,
    title: `task ${seq}`,
    status: 'next',
    source: 'manual',
    createdAt: new Date(2026, 5, 1, 9, 0, seq),
    touchedAt: new Date(2026, 5, 1, 9, 0, seq),
    ...partial,
  });
}

function project(partial: Partial<Project> = {}): Project {
  seq += 1;
  return ProjectSchema.parse({
    id: `22222222-2222-4222-8222-${String(Math.abs(seq)).padStart(12, '0')}`,
    title: `project ${seq}`,
    status: 'active',
    lastTouchedAt: new Date(2026, 5, 1),
    createdAt: new Date(2026, 5, 1),
    updatedAt: new Date(2026, 5, 1),
    ...partial,
  });
}

function session(partial: Partial<Session> = {}): Session {
  seq += 1;
  return SessionSchema.parse({
    id: `33333333-3333-4333-8333-${String(seq).padStart(12, '0')}`,
    startedAt: new Date(2026, 5, 14, 9, 0),
    durationMinutes: 20,
    rating: 3,
    createdAt: new Date(2026, 5, 14, 9, 0),
    updatedAt: new Date(2026, 5, 14, 9, 0),
    ...partial,
  });
}

const baseInput = {
  now: NOW,
  capacity: { capacityMin: 630 },
  domainTime: {} as Record<string, number>,
  projects: [] as Project[],
  recentSessions: [] as Session[],
  domains: [] as { id: string; name: string }[],
};

describe('rankPicks filtering and determinism', () => {
  it('only considers next tasks, and defers future ones', () => {
    const eligible = task({ title: 'eligible' });
    const inbox = task({ status: 'inbox', title: 'inbox' });
    const later = task({ deferUntil: new Date(2026, 5, 20), title: 'later' });
    const past = task({ deferUntil: new Date(2026, 5, 10), title: 'past defer' });

    const picks = rankPicks({ ...baseInput, tasks: [inbox, later, eligible, past] });
    const titles = picks.map((pick) => pick.task.title);
    expect(titles).toContain('eligible');
    expect(titles).toContain('past defer');
    expect(titles).not.toContain('inbox');
    expect(titles).not.toContain('later');
  });

  it('drops a task whose estimate cannot fit the day', () => {
    const huge = task({ title: 'huge', estimateMin: 700 });
    const fits = task({ title: 'fits', estimateMin: 60 });
    const picks = rankPicks({ ...baseInput, tasks: [huge, fits] });
    expect(picks.map((pick) => pick.task.title)).toEqual(['fits']);
  });

  it('suggests at most three, deterministically, regardless of input order', () => {
    const tasks = Array.from({ length: 7 }, (_, index) => task({ title: `t${index}` }));
    const first = rankPicks({ ...baseInput, tasks }).map((pick) => pick.task.id);
    expect(first).toHaveLength(MAX_PICKS);

    // 50 deterministic shuffles of the input arrays.
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 50; round += 1) {
      const shuffled = [...tasks];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      expect(rankPicks({ ...baseInput, tasks: shuffled }).map((pick) => pick.task.id)).toEqual(first);
    }
  });

  it('breaks ties by createdAt and then id', () => {
    const older = task({ title: 'older', createdAt: new Date(2026, 5, 1, 8, 0), touchedAt: new Date(2026, 5, 1, 8, 0) });
    const newer = task({ title: 'newer', createdAt: new Date(2026, 5, 2, 8, 0), touchedAt: new Date(2026, 5, 2, 8, 0) });
    const picks = rankPicks({ ...baseInput, tasks: [newer, older] });
    expect(picks.map((pick) => pick.task.title)).toEqual(['older', 'newer']);
  });
});

describe('rankPicks signals', () => {
  it('raises a passed due date quietly, with no guilt wording', () => {
    const passed = task({ title: 'passed', dueAt: new Date(2026, 5, 10), estimateMin: 10 });
    const plain = task({ title: 'plain', estimateMin: 10 });
    const picks = rankPicks({ ...baseInput, tasks: [plain, passed] });
    expect(picks[0]?.task.title).toBe('passed');
    expect(picks[0]?.reasons.join(' ')).toMatch(/due 2026-06-10/);
    for (const pick of picks) {
      expect(pick.reasons.join(' ')).not.toMatch(GUILT);
    }
  });

  it('scores cadence debt from the last seven local days', () => {
    const projectWithDebt = project({ title: 'Novel', cadencePerWeek: 3 });
    const withDebt = task({ title: 'with debt', projectId: projectWithDebt.id, estimateMin: 10 });
    const noProject = task({ title: 'no project', estimateMin: 10 });

    const picks = rankPicks({
      ...baseInput,
      tasks: [noProject, withDebt],
      projects: [projectWithDebt],
      recentSessions: [
        session({ projectId: projectWithDebt.id, startedAt: new Date(2026, 5, 14, 9, 0) }),
        session({ projectId: projectWithDebt.id, startedAt: new Date(2026, 5, 13, 9, 0) }),
      ],
    });

    expect(picks[0]?.task.title).toBe('with debt');
    expect(picks[0]?.reasons.join(' ')).toMatch(/wants 3 a week and has had 2 this week/);
    expect(picks[0]?.reasons.join(' ')).not.toMatch(GUILT);
    expect(cadenceDebt(projectWithDebt, [], NOW)).toBe(3);
  });

  it('ignores cadence for a paused project', () => {
    const paused = project({ cadencePerWeek: 3, status: 'paused' });
    const debtTask = task({ title: 'debt', projectId: paused.id, estimateMin: 10 });
    const picks = rankPicks({ ...baseInput, tasks: [debtTask], projects: [paused] });
    expect(picks[0]?.reasons.join(' ')).not.toMatch(/wants/);
  });

  it('raises a domain that has had little time today', () => {
    const domainId = '44444444-4444-4444-8444-444444444444';
    const balanced = task({ title: 'balanced', domainId, estimateMin: 10 });
    const used = task({ title: 'used', domainId, estimateMin: 10 });

    const picks = rankPicks({
      ...baseInput,
      tasks: [used, balanced],
      domainTime: { [domainId]: 400 },
      domains: [{ id: domainId, name: 'Trading' }],
    });
    // 400 * 3 >= 630, so no balance points and no balance reason.
    expect(picks[0]?.reasons.join(' ')).not.toMatch(/little time/);

    const picksEmptyDay = rankPicks({
      ...baseInput,
      tasks: [balanced],
      domainTime: {},
      domains: [{ id: domainId, name: 'Trading' }],
    });
    expect(picksEmptyDay[0]?.reasons.join(' ')).toMatch(/Trading has had little time today/);
  });

  it('lets the anchor domain use its window and keeps other domains out of it', () => {
    const anchorDomain = '55555555-5555-4555-8555-555555555555';
    const otherDomain = '66666666-6666-4666-8666-666666666666';
    const anchor: AnchorInterval = {
      id: '77777777-7777-4777-8777-777777777777',
      title: 'Trading block',
      domainId: anchorDomain,
      start: new Date(localWallClockToEpoch('2026-06-15', '09:00')),
      end: new Date(localWallClockToEpoch('2026-06-15', '11:00')),
    };

    // computeCapacity has already removed the anchor from the 400 minutes, so
    // an other-domain task must fit inside 400; the anchor's own domain gains
    // the 120-minute window back (400 + 120).
    const other = task({ title: 'other domain', domainId: otherDomain, estimateMin: 450 });
    const same = task({ title: 'same domain', domainId: anchorDomain, estimateMin: 450 });

    const picks = rankPicks({
      ...baseInput,
      capacity: { capacityMin: 400 },
      tasks: [other, same],
      anchors: [anchor],
    });
    const titles = picks.map((pick) => pick.task.title);
    expect(titles).not.toContain('other domain');
    expect(titles).toContain('same domain');
  });

  it('does not double-subtract anchors that capacity already removed (integration)', async () => {
    const { computeCapacity } = await import('@/lib/planning/capacity');
    const { expandAnchors } = await import('@/lib/planning/anchors');
    const anchors = [
      {
        id: '88888888-8888-4888-8888-888888888888',
        title: 'Lunch',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        start: '12:00',
        end: '14:00',
        domainId: null,
      },
    ];
    const capacity = computeCapacity({
      day: '2026-06-17',
      wakingHours: { start: '07:00', end: '22:00' },
      fixedBlocks: [],
      anchors,
    });
    expect(capacity.capacityMin).toBe(585);

    const picks = rankPicks({
      ...baseInput,
      now: new Date(2026, 5, 17, 9, 0),
      capacity,
      anchors: expandAnchors(anchors, '2026-06-17'),
      tasks: [task({ title: 'big task', estimateMin: 500 })],
    });
    expect(picks.map((pick) => pick.task.title)).toEqual(['big task']);
  });

  it('counts a task without an estimate as the documented default (25)', () => {
    expect(DEFAULT_TASK_MINUTES).toBe(25);
    const unbounded = task({ title: 'no estimate' });
    expect(rankPicks({ ...baseInput, capacity: { capacityMin: 24 }, tasks: [unbounded] })).toHaveLength(0);
    expect(rankPicks({ ...baseInput, capacity: { capacityMin: 25 }, tasks: [unbounded] })).toHaveLength(1);
  });
});

describe('rankPicks uses local calendar days, not 24-hour elapsed time', () => {
  it('does not call a due date at 00:00 tomorrow "passed" at 23:00 tonight', () => {
    const now = new Date(2026, 5, 15, 23, 0);
    const dueTomorrow = task({ title: 'tomorrow', dueAt: new Date(2026, 5, 16, 0, 0), estimateMin: 10 });
    const picks = rankPicks({ ...baseInput, now, tasks: [dueTomorrow] });
    // within-3 tier (30) + energy fit (10), not the passed tier (40).
    expect(picks[0]?.score).toBe(40);
    expect(picks[0]?.reasons.join(' ')).toMatch(/due 2026-06-16/);
    expect(picks[0]?.reasons.join(' ')).not.toMatch(GUILT);
  });

  it('counts whole calendar days for the due tiers', () => {
    const now = new Date(2026, 5, 15, 23, 0);
    const inThree = task({ title: 'in three', dueAt: new Date(2026, 5, 18, 23, 59), estimateMin: 10 });
    const inFifteen = task({ title: 'in fifteen', dueAt: new Date(2026, 5, 30, 23, 59), estimateMin: 10 });
    const picks = rankPicks({ ...baseInput, now, tasks: [inThree, inFifteen] });
    const byTitle = new Map(picks.map((pick) => [pick.task.title, pick.score]));
    expect(byTitle.get('in three')).toBe(40); // 30 due + 10 energy
    expect(byTitle.get('in fifteen')).toBe(10); // no due points + 10 energy
  });

  it('counts the calendar boundary, not a rolling 7*24h window', () => {
    // 09:00 on the 15th. A session at 23:00 on the 8th is seven local days back
    // but LATER in the day than now, so a rolling now-7d window would wrongly
    // include it. The calendar window must not.
    const now = new Date(2026, 5, 15, 9, 0);
    const projectWithDebt = project({ title: 'Cadence', cadencePerWeek: 3 });
    const seventhDayLater = session({ projectId: projectWithDebt.id, startedAt: new Date(2026, 5, 8, 23, 0) });
    const sixthDayEarly = session({ projectId: projectWithDebt.id, startedAt: new Date(2026, 5, 9, 0, 10) });

    expect(cadenceDebt(projectWithDebt, [seventhDayLater], now)).toBe(3);
    expect(cadenceDebt(projectWithDebt, [sixthDayEarly], now)).toBe(2);
    expect(cadenceDebt(projectWithDebt, [seventhDayLater, sixthDayEarly], now)).toBe(2);
  });

  it('uses the same calendar boundary across a DST week', () => {
    inZone('America/Los_Angeles', () => {
      // Fall-back week (2026-11-01). A 7*24h rolling window lands on the wrong
      // side of the repeated hour; the local-day window does not.
      const now = new Date(2026, 10, 2, 9, 0);
      const projectWithDebt = project({ title: 'Cadence', cadencePerWeek: 3 });
      const seventhDayLater = session({ projectId: projectWithDebt.id, startedAt: new Date(2026, 9, 26, 23, 0) });
      const sixthDayEarly = session({ projectId: projectWithDebt.id, startedAt: new Date(2026, 9, 27, 0, 10) });

      expect(cadenceDebt(projectWithDebt, [seventhDayLater], now)).toBe(3);
      expect(cadenceDebt(projectWithDebt, [sixthDayEarly], now)).toBe(2);
    });
  });

  it('counts a session 6 local days ago and not one 7 days ago', () => {
    const now = new Date(2026, 5, 15, 23, 0);
    const projectWithDebt = project({ title: 'Cadence', cadencePerWeek: 3 });
    const sixDaysAgo = session({ projectId: projectWithDebt.id, startedAt: new Date(2026, 5, 9, 23, 30) });
    const sevenDaysAgo = session({ projectId: projectWithDebt.id, startedAt: new Date(2026, 5, 8, 0, 30) });

    expect(cadenceDebt(projectWithDebt, [sixDaysAgo], now)).toBe(2);
    expect(cadenceDebt(projectWithDebt, [sevenDaysAgo], now)).toBe(3);
    expect(cadenceDebt(projectWithDebt, [sixDaysAgo, sevenDaysAgo], now)).toBe(2);
  });
});

describe('rankPicks project cap', () => {
  it('does not let one project fill every pick when another project has work', () => {
    const dominant = project({ title: 'Dominant' });
    const other = project({ title: 'Other' });
    const tasks = [
      ...Array.from({ length: 3 }, (_, index) =>
        task({ title: `d${index}`, projectId: dominant.id, createdAt: new Date(2026, 5, 1, 8, 0, index), touchedAt: new Date(2026, 5, 1, 8, 0, index) }),
      ),
      task({ title: 'o0', projectId: other.id, createdAt: new Date(2026, 5, 2, 8, 0), touchedAt: new Date(2026, 5, 2, 8, 0) }),
    ];

    const picks = rankPicks({ ...baseInput, tasks, projects: [dominant, other] });
    const fromDominant = picks.filter((pick) => pick.task.projectId === dominant.id);
    expect(fromDominant).toHaveLength(MAX_PICKS_PER_PROJECT);
    expect(picks.map((pick) => pick.task.title)).toContain('o0');
  });

  it('allows three picks from one project when it is the only project', () => {
    const only = project({ title: 'Only' });
    const tasks = Array.from({ length: 4 }, (_, index) =>
      task({ title: `only${index}`, projectId: only.id, createdAt: new Date(2026, 5, 1, 8, 0, index), touchedAt: new Date(2026, 5, 1, 8, 0, index) }),
    );
    const picks = rankPicks({ ...baseInput, tasks, projects: [only] });
    expect(picks).toHaveLength(MAX_PICKS);
  });
});

describe('rankPicks cadence: work done through tasks, and minutes-based rhythms', () => {
  const cadenceReason = (reasons: string[]) => reasons.find((reason) => / wants \d+ /.test(reason));

  it('counts a session spent on one of the project\'s tasks, as every Start button records it', () => {
    const novel = project({ title: 'Novel', cadencePerWeek: 2 });
    const t = task({ title: 'Write the scene', projectId: novel.id });
    const viaTask = session({ taskId: t.id, projectId: null, startedAt: new Date(2026, 5, 14, 9, 0) });

    const before = rankPicks({ ...baseInput, tasks: [t], projects: [novel] })[0]!;
    const after = rankPicks({ ...baseInput, tasks: [t], projects: [novel], recentSessions: [viaTask] })[0]!;

    expect(cadenceReason(before.reasons)).toBe('Novel wants 2 a week and has had 0 this week');
    expect(cadenceReason(after.reasons)).toBe('Novel wants 2 a week and has had 1 this week');
    expect(before.score - after.score).toBe(15);
  });

  it('is met once the week has had its sessions, and then adds nothing', () => {
    const novel = project({ title: 'Novel', cadencePerWeek: 1 });
    const t = task({ title: 'Write the scene', projectId: novel.id });
    const done = session({ taskId: t.id, startedAt: new Date(2026, 5, 14, 9, 0) });
    const pick = rankPicks({ ...baseInput, tasks: [t], projects: [novel], recentSessions: [done] })[0]!;
    expect(cadenceReason(pick.reasons)).toBeUndefined();
  });

  it('weighs a short touch by its minutes when the project has a block length', () => {
    const course = project({ title: 'Course', cadencePerWeek: 2, cadenceBlockMin: 45 });
    const t = task({ title: 'Watch lesson 3', projectId: course.id });
    const touch = session({ taskId: t.id, startedAt: new Date(2026, 5, 14, 9, 0), durationMinutes: 10 });
    const full = session({ taskId: t.id, startedAt: new Date(2026, 5, 14, 9, 0), durationMinutes: 45 });

    const afterTouch = rankPicks({ ...baseInput, tasks: [t], projects: [course], recentSessions: [touch] })[0]!;
    expect(cadenceReason(afterTouch.reasons)).toBe('Course wants 2 blocks of 45 min a week and has had 10 min this week');
    const afterFull = rankPicks({ ...baseInput, tasks: [t], projects: [course], recentSessions: [full] })[0]!;
    expect(afterTouch.score - afterFull.score).toBe(15); // two blocks wanted vs one
    expect(GUILT.test(afterTouch.reasons.join(' '))).toBe(false);
  });

  it('keeps the cadence points capped however big the debt', () => {
    const wide = project({ title: 'Wide', cadencePerWeek: 7 });
    const plain = project({ title: 'Plain' });
    const a = task({ title: 'a', projectId: wide.id });
    const b = task({ title: 'b', projectId: plain.id });
    const [first, second] = rankPicks({ ...baseInput, tasks: [a, b], projects: [wide, plain] });
    expect(first!.task.id).toBe(a.id);
    expect(first!.score - second!.score).toBe(45);
  });
});
