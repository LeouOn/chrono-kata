import { describe, expect, it } from 'vitest';
import {
  accumulateActualMinutes,
  sumSessionMinutes,
  BREADCRUMB_MAX,
  cleanBreadcrumb,
  planSessionOutcome,
  type SessionOutcomeInput,
} from '@/lib/sessions/outcome';
import type { TaskContext, ProjectContext } from '@/lib/sessions/outcome';

const session = (overrides: Partial<SessionOutcomeInput> = {}): SessionOutcomeInput => ({
  id: 'session-1',
  durationMinutes: 25,
  ...overrides,
});

const task = (overrides: Partial<TaskContext> = {}): TaskContext => ({
  id: 'task-1',
  status: 'next',
  actualMin: 10,
  ...overrides,
});

const project = (overrides: Partial<ProjectContext> = {}): ProjectContext => ({
  id: 'project-1',
  ...overrides,
});

describe('cleanBreadcrumb', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanBreadcrumb('  pick up at   the  sink  ')).toBe('pick up at the sink');
  });

  it('strips a leading "pick up here next time:" style prefix', () => {
    expect(cleanBreadcrumb('Pick up here next time: re-read section 3')).toBe('re-read section 3');
    expect(cleanBreadcrumb('pick up here - re-read section 3')).toBe('re-read section 3');
    expect(cleanBreadcrumb('Next: draft the intro')).toBe('draft the intro');
    expect(cleanBreadcrumb('Where I left off — paragraph 2')).toBe('paragraph 2');
  });

  it('caps at the next-action limit', () => {
    const cleaned = cleanBreadcrumb('a'.repeat(900));
    expect(cleaned).toHaveLength(BREADCRUMB_MAX);
  });

  it('never returns null or throws on empty input', () => {
    expect(cleanBreadcrumb(null)).toBe('');
    expect(cleanBreadcrumb(undefined)).toBe('');
    expect(cleanBreadcrumb('   ')).toBe('');
    expect(cleanBreadcrumb('Pick up here next time:')).toBe('');
  });
});

describe('accumulateActualMinutes', () => {
  it('adds timed session minutes to the task', () => {
    expect(accumulateActualMinutes(10, 25)).toBe(35);
  });

  it('keeps 30-second precision without float drift', () => {
    expect(accumulateActualMinutes(0.5, 12.25)).toBe(12.75);
    expect(accumulateActualMinutes(12.75, 0.5)).toBe(13.25);
    expect(accumulateActualMinutes(0.1, 0.2)).toBe(0.3);
  });

  it('treats a missing current value as zero', () => {
    expect(accumulateActualMinutes(null, 20)).toBe(20);
    expect(accumulateActualMinutes(undefined, 20)).toBe(20);
  });

  it('ignores a reps-only session', () => {
    expect(accumulateActualMinutes(10, null)).toBeUndefined();
    expect(accumulateActualMinutes(10, 0)).toBeUndefined();
  });

  it('several sessions sum', () => {
    let total: number | undefined = undefined;
    for (const minutes of [10, 12.5, 7.5]) {
      total = accumulateActualMinutes(total, minutes);
    }
    expect(total).toBe(30);
  });
});

describe('sumSessionMinutes (recompute path for edit/delete)', () => {
  it('sums only timed sessions, with the same rounding', () => {
    expect(
      sumSessionMinutes([
        { durationMinutes: 10 },
        { durationMinutes: 12.5 },
        { durationMinutes: null },
        { durationMinutes: 0.25 },
      ]),
    ).toBe(22.75);
  });

  it('returns 0 when no timed sessions remain', () => {
    expect(sumSessionMinutes([])).toBe(0);
    expect(sumSessionMinutes([{ durationMinutes: null }])).toBe(0);
  });
});

describe('planSessionOutcome', () => {
  it('adds minutes, touches the task and maps done -> done', () => {
    const plan = planSessionOutcome(session({ outcome: 'done' }), task({ status: 'next' }), null);
    expect(plan.validation).toEqual({ ok: true });
    expect(plan.task).toEqual({
      id: 'task-1',
      patch: { actualMin: 35 },
      status: 'done',
    });
    expect(plan.project).toBeUndefined();
  });

  it('progress leaves the status alone but still records minutes', () => {
    const plan = planSessionOutcome(session({ outcome: 'progress' }), task({ status: 'scheduled' }), null);
    expect(plan.task?.patch).toEqual({ actualMin: 35 });
    expect(plan.task?.status).toBeUndefined();
  });

  it('blocked -> waiting where the transition matrix allows it', () => {
    for (const status of ['inbox', 'next', 'scheduled'] as const) {
      const plan = planSessionOutcome(session({ outcome: 'blocked' }), task({ status }), null);
      expect(plan.task?.status, status).toBe('waiting');
      expect(plan.warnings).toEqual([]);
    }
  });

  it('reports blocked -> waiting as a warning from done/dropped, without changing status', () => {
    for (const status of ['done', 'dropped'] as const) {
      const plan = planSessionOutcome(session({ outcome: 'blocked' }), task({ status }), null);
      expect(plan.task?.status, status).toBeUndefined();
      expect(plan.warnings.join(' '), status).toMatch(/not reachable from/);
    }
  });

  it('does not move a task that is already done', () => {
    const plan = planSessionOutcome(session({ outcome: 'done' }), task({ status: 'done' }), null);
    expect(plan.task?.status).toBeUndefined();
    expect(plan.warnings).toEqual([]);
  });

  it('reps-only sessions change no minutes and warn', () => {
    const plan = planSessionOutcome(
      session({ durationMinutes: null, reps: 50, outcome: 'progress' }),
      task({ actualMin: 10 }),
      null,
    );
    expect(plan.task?.patch).toEqual({});
    expect(plan.warnings.join(' ')).toMatch(/reps-only/);
  });

  it('copies the breadcrumb onto the project and proposes it as the task next action', () => {
    const plan = planSessionOutcome(
      session({ outcome: 'progress', breadcrumb: 'Pick up here next time: chapter 4 exercises' }),
      task(),
      project(),
    );
    expect(plan.breadcrumb).toBe('chapter 4 exercises');
    expect(plan.project?.patch).toEqual({ breadcrumb: 'chapter 4 exercises' });
    expect(plan.task?.patch.nextAction).toBe('chapter 4 exercises');
  });

  it('requires a breadcrumb for a project and writes nothing', () => {
    const plan = planSessionOutcome(session({ outcome: 'progress' }), task(), project());
    expect(plan.validation).toEqual({ ok: false, reason: 'project-breadcrumb-required' });
    expect(plan.project).toBeUndefined();
    expect(plan.task).toBeUndefined();
  });

  it('accepts a task-only session with no breadcrumb', () => {
    const plan = planSessionOutcome(session({ outcome: 'progress', breadcrumb: '   ' }), task(), null);
    expect(plan.validation).toEqual({ ok: true });
    expect(plan.task?.patch.nextAction).toBeUndefined();
  });

  it('produces an empty plan for a practice session', () => {
    const plan = planSessionOutcome(
      session({ taskId: null, projectId: null, outcome: null, breadcrumb: null }),
      null,
      null,
    );
    expect(plan.task).toBeUndefined();
    expect(plan.project).toBeUndefined();
    expect(plan.validation).toEqual({ ok: true });
    expect(plan.warnings).toEqual([]);
    expect(plan.breadcrumb).toBe('');
  });
});
