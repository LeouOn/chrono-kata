import { describe, expect, it } from 'vitest';
import {
  cadenceAdherence,
  estimateAccuracy,
  inboxThroughput,
  timePerDomain,
  type AnalyticsInput,
} from '@/lib/insights/analytics';
import type { Project } from '@/lib/schemas/project';
import type { Session } from '@/lib/schemas/session';
import type { Task } from '@/lib/schemas/task';
import type { Estimate } from '@/lib/schemas/estimate';

/**
 * Permanent versions of the lead's round-1 probes for PR #66, plus the
 * rule-isolating tests for each fix (domain via project, in-progress week,
 * all-energy keys, estimate-at-first-session, day-key window).
 */

const NOW = new Date('2026-10-21T12:00:00Z'); // a Wednesday
const DOMAIN_A = '11111111-1111-4111-8111-111111111111';
const DOMAIN_B = '22222222-2222-4222-8222-222222222222';
const PROJECT_A = 'aaaa0000-0000-4000-8000-000000000001';

function makeSession(partial: Partial<Session> & { startedAt: Date }): Session {
  const startedAt = partial.startedAt;
  return {
    id: crypto.randomUUID(),
    durationMinutes: 10,
    reps: null,
    rating: 3,
    activityLabel: undefined,
    note: undefined,
    coachComment: null,
    calendarEventId: null,
    failedLLM: false,
    taskId: null,
    projectId: null,
    blockId: null,
    ...partial,
    startedAt,
    endedAt: new Date(startedAt.getTime() + 30 * 60 * 1000),
    createdAt: startedAt,
    updatedAt: startedAt,
  } as Session;
}

function makeTask(partial: Partial<Task> & { id: string }): Task {
  return {
    title: 'Task',
    domainId: null,
    projectId: null,
    parentId: null,
    status: 'done',
    estimateMin: 10,
    actualMin: 10,
    energy: null,
    context: null,
    dueAt: null,
    deferUntil: null,
    source: 'manual',
    createdAt: new Date('2026-10-01T09:00:00Z'),
    touchedAt: new Date('2026-10-01T09:00:00Z'),
    doneAt: new Date('2026-10-01T11:00:00Z'),
    ...partial,
  } as Task;
}

const project: Project = {
  id: PROJECT_A,
  title: 'Trading system',
  domainId: DOMAIN_A,
  status: 'active',
  cadencePerWeek: 2,
  breadcrumb: null,
  lastTouchedAt: NOW,
  createdAt: new Date('2026-09-01T09:00:00Z'),
  updatedAt: NOW,
};

describe('probe A: project-only sessions are domain work', () => {
  const input: AnalyticsInput = {
    now: NOW,
    projects: [project],
    tasks: [],
    estimates: [],
    sessions: [makeSession({ startedAt: new Date('2026-10-20T09:00:00Z'), projectId: PROJECT_A, durationMinutes: 10 })],
  };

  it('a 10-minute project session with no task counts in its domain', () => {
    const domains = timePerDomain(input);
    expect(domains).toEqual([{ domainId: DOMAIN_A, minutes: 10, sessions: 1 }]);
  });

  it('a task with no domain inside a domain project uses the project domain', () => {
    const task = makeTask({ id: '10000000-0000-4000-8000-00000000000a', projectId: PROJECT_A });
    const withTask: AnalyticsInput = {
      ...input,
      tasks: [task],
      sessions: [makeSession({ startedAt: task.createdAt, taskId: task.id })],
    };
    expect(timePerDomain(withTask)).toEqual([{ domainId: DOMAIN_A, minutes: 10, sessions: 1 }]);
  });

  it('a task with its own domain inside ANOTHER domain\u2019s project: the task wins', () => {
    const task = makeTask({ id: '10000000-0000-4000-8000-00000000000b', projectId: PROJECT_A, domainId: DOMAIN_B });
    const withTask: AnalyticsInput = {
      ...input,
      tasks: [task],
      sessions: [makeSession({ startedAt: task.createdAt, taskId: task.id })],
    };
    expect(timePerDomain(withTask)).toEqual([{ domainId: DOMAIN_B, minutes: 10, sessions: 1 }]);
  });

  it('practice sessions (no task, no project) stay out of every table', () => {
    const practice: AnalyticsInput = {
      ...input,
      sessions: [makeSession({ startedAt: new Date('2026-10-20T10:00:00Z') })],
    };
    expect(timePerDomain(practice)).toEqual([]);
  });
});

describe('probe B: the in-progress week is not an unmet week', () => {
  function adherenceFor(sessionsThisWeek: number) {
    const sessions = [
      makeSession({ startedAt: new Date('2026-10-13T09:00:00Z'), projectId: PROJECT_A }), // completed week, met (2)
      makeSession({ startedAt: new Date('2026-10-15T09:00:00Z'), projectId: PROJECT_A }),
      ...Array.from({ length: sessionsThisWeek }, (_, i) =>
        makeSession({ startedAt: new Date(`2026-10-2${i}T09:00:00Z`), projectId: PROJECT_A }),
      ),
    ];
    return cadenceAdherence({ now: NOW, projects: [project], tasks: [], estimates: [], sessions })[0]!;
  }

  it('a Wednesday with 1 of 2 sessions is in progress, not unmet', () => {
    const adherence = adherenceFor(1);
    const current = adherence.weeks.at(-1)!;
    expect(current.inProgress).toBe(true);
    expect(current.met).toBe(false);
    expect(adherence.metWeeks).toBe(1);
    expect(adherence.totalWeeks).toBe(1); // the in-progress week is excluded
  });

  it('an in-progress week that already met the target counts as met', () => {
    const adherence = adherenceFor(2);
    const current = adherence.weeks.at(-1)!;
    expect(current.inProgress).toBe(true);
    expect(current.met).toBe(true);
    expect(adherence.metWeeks).toBe(2);
    expect(adherence.totalWeeks).toBe(2);
  });
});

describe('probe C: byEnergy always has all three keys, null when empty', () => {
  it('no NaN reaches a chart or CSV', () => {
    const input: AnalyticsInput = {
      now: NOW,
      projects: [project],
      tasks: [makeTask({ id: '10000000-0000-4000-8000-00000000000c', energy: 'low' })],
      estimates: [
        {
          id: '20000000-0000-4000-8000-00000000000c',
          taskId: '10000000-0000-4000-8000-00000000000c',
          source: 'user',
          minutes: 10,
          rationale: null,
          createdAt: new Date('2026-09-30T09:00:00Z'),
          updatedAt: new Date('2026-09-30T09:00:00Z'),
        },
      ],
      sessions: [makeSession({ startedAt: new Date('2026-10-01T09:00:00Z'), taskId: '10000000-0000-4000-8000-00000000000c' })],
    };
    const accuracy = estimateAccuracy(input);
    expect(Object.keys(accuracy.byEnergy).sort()).toEqual(['high', 'low', 'med']);
    expect(accuracy.byEnergy.low!.n).toBe(1);
    expect(accuracy.byEnergy.med).toBeNull();
    expect(accuracy.byEnergy.high).toBeNull();
  });
});

describe('rule: estimates are predictions, not hindsight', () => {
  const TASK = '10000000-0000-4000-8000-00000000000d';
  const estimate = (minutes: number, at: string): Estimate => ({
    id: crypto.randomUUID(),
    taskId: TASK,
    source: 'user',
    minutes,
    rationale: null,
    createdAt: new Date(at),
    updatedAt: new Date(at),
  });
  const input = (estimates: Estimate[]): AnalyticsInput => ({
    now: NOW,
    projects: [],
    tasks: [makeTask({ id: TASK })],
    estimates,
    sessions: [makeSession({ startedAt: new Date('2026-10-01T10:00:00Z'), taskId: TASK, durationMinutes: 20 })],
  });

  it('a re-estimate made AFTER the first session never wins', () => {
    // 20 actual minutes; the pre-session guess 10 (ratio 2), a hindsight 20 (ratio 1).
    const accuracy = estimateAccuracy(input([estimate(10, '2026-09-30T09:00:00Z'), estimate(20, '2026-10-02T09:00:00Z')]));
    expect(accuracy.bySource['user']!.median).toBe(2);
  });

  it('when nothing precedes the first session, the EARLIEST estimate is the fallback', () => {
    const accuracy = estimateAccuracy(input([estimate(5, '2026-10-02T09:00:00Z'), estimate(40, '2026-10-03T09:00:00Z')]));
    expect(accuracy.bySource['user']!.median).toBe(4); // 20/5, not 20/40
  });
});

describe('rule: the inbox window is in local days', () => {
  const zones: [string, string][] = [
    ['Europe/Helsinki', '2026-10-25'], // fall-back Sunday
    ['America/Los_Angeles', '2026-11-01'], // fall-back Sunday
  ];

  for (const [zone, boundaryDay] of zones) {
    it(`${zone}: a task made early on the previous local day is inside a 1-day window`, () => {
      process.env.TZ = zone;
      try {
        // Window of ONE local day: "today" is the boundary day and `now` is
        // late; a task made at 08:00 YESTERDAY is outside an instant-based
        // 24h window (now-24h is yesterday 23:30) but INSIDE a local-day
        // window (yesterday is the boundary day and whole days count).
        const now = new Date(`${boundaryDay}T23:30:00`);
        const [y = 0, m = 1, d = 1] = boundaryDay.split('-').map(Number);
        const yesterdayMorning = new Date(y, m - 1, d - 1, 8, 0, 0);
        const captured = makeTask({ id: '10000000-0000-4000-8000-00000000000e', status: 'inbox', createdAt: yesterdayMorning });
        const throughput = inboxThroughput({ now, projects: [], tasks: [captured], estimates: [], sessions: [] }, 1);
        expect(throughput.captured).toBe(1);
      } finally {
        delete process.env.TZ;
      }
    });
  }
});
