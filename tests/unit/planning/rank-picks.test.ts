import { describe, expect, it } from 'vitest';
import { rankPicks, cadenceDebt, DEFAULT_TASK_MINUTES, MAX_PICKS, MAX_PICKS_PER_PROJECT } from '@/lib/planning/rank-picks';
import type { AnchorInterval } from '@/lib/planning/anchors';
import { TaskSchema, type Task } from '@/lib/schemas/task';
import { ProjectSchema, type Project } from '@/lib/schemas/project';
import { SessionSchema, type Session } from '@/lib/schemas/session';
import { localWallClockToEpoch } from '@/lib/planning/time';

const NOW = new Date(2026, 5, 15, 9, 0);
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

  it('keeps other domains out of an anchor window, but lets the anchor domain use it', () => {
    const anchorDomain = '55555555-5555-4555-8555-555555555555';
    const otherDomain = '66666666-6666-4666-8666-666666666666';
    const anchor: AnchorInterval = {
      id: '77777777-7777-4777-8777-777777777777',
      title: 'Trading block',
      domainId: anchorDomain,
      start: new Date(localWallClockToEpoch('2026-06-15', '09:00')),
      end: new Date(localWallClockToEpoch('2026-06-15', '11:00')),
    };

    const other = task({ title: 'other domain', domainId: otherDomain, estimateMin: 520 });
    const same = task({ title: 'same domain', domainId: anchorDomain, estimateMin: 520 });

    const picks = rankPicks({ ...baseInput, tasks: [other, same], anchors: [anchor] });
    const titles = picks.map((pick) => pick.task.title);
    // 520 > 630 - 120 for the other domain, so it cannot be a pick today.
    expect(titles).not.toContain('other domain');
    // The anchor's own domain can use its window.
    expect(titles).toContain('same domain');
  });

  it('counts a task without an estimate as the documented default (25)', () => {
    expect(DEFAULT_TASK_MINUTES).toBe(25);
    const unbounded = task({ title: 'no estimate' });
    expect(rankPicks({ ...baseInput, capacity: { capacityMin: 24 }, tasks: [unbounded] })).toHaveLength(0);
    expect(rankPicks({ ...baseInput, capacity: { capacityMin: 25 }, tasks: [unbounded] })).toHaveLength(1);
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
