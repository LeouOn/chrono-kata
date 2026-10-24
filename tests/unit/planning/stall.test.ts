import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STALL_DAYS,
  MINIMUM_SESSION_MIN,
  detectStalls,
  lastWorkByProject,
  stallThresholdDays,
} from '@/lib/planning/stall';
import { addDays } from '@/lib/pacing/days';
import { inZone, local, makeProject, makeSession, makeTask } from './w10-helpers';

const TODAY = '2026-06-17';
const now = () => local(TODAY, 8, 0);
const ago = (days: number, hour = 12, minute = 0) => local(addDays(TODAY, -days), hour, minute);

describe('constants', () => {
  it('offers ten minutes, and calls a rhythm-less project quiet after a week', () => {
    expect(MINIMUM_SESSION_MIN).toBe(10);
    expect(DEFAULT_STALL_DAYS).toBe(7);
  });
});

describe('stallThresholdDays', () => {
  it('uses the project\'s own setting first', () => {
    expect(stallThresholdDays({ stallAfterDays: 3, cadencePerWeek: 1 })).toBe(3);
    expect(stallThresholdDays({ stallAfterDays: 365, cadencePerWeek: 7 })).toBe(365);
  });

  it('otherwise waits twice the project\'s usual gap, never less than a week', () => {
    // gap = ceil(7 / perWeek): 7, 4, 3, 2, 2, 2, 1 days -> doubled
    const byCadence = [1, 2, 3, 4, 5, 6, 7].map((c) => stallThresholdDays({ cadencePerWeek: c }));
    expect(byCadence).toEqual([14, 8, 7, 7, 7, 7, 7]);
  });

  it('is the default for a project with no rhythm, and the default is configurable', () => {
    expect(stallThresholdDays({})).toBe(7);
    expect(stallThresholdDays({ cadencePerWeek: null, stallAfterDays: null })).toBe(7);
    expect(stallThresholdDays({}, 10)).toBe(10);
    // The configurable default is a floor for rhythmic projects too.
    expect(stallThresholdDays({ cadencePerWeek: 7 }, 10)).toBe(10);
    expect(stallThresholdDays({ cadencePerWeek: 1 }, 10)).toBe(14);
  });
});

describe('lastWorkByProject: what counts as work', () => {
  it('starts from the project\'s own lastTouchedAt', () => {
    const project = makeProject({ lastTouchedAt: ago(5) });
    expect(lastWorkByProject([project], [], []).get(project.id)).toEqual(ago(5));
  });

  it('counts a session on the project, and one on its task, by when it ended', () => {
    const project = makeProject({ lastTouchedAt: ago(30) });
    const task = makeTask({ projectId: project.id });
    const direct = makeSession({ projectId: project.id, startedAt: ago(9), endedAt: ago(9, 12, 30) });
    const viaTask = makeSession({ taskId: task.id, startedAt: ago(4, 9) });
    const last = lastWorkByProject([project], [direct, viaTask], [task]).get(project.id)!;
    expect(last).toEqual(ago(4, 9));
    const endedLater = makeSession({ taskId: task.id, startedAt: ago(2, 9), endedAt: ago(2, 10) });
    expect(lastWorkByProject([project], [viaTask, endedLater], [task]).get(project.id)).toEqual(ago(2, 10));
  });

  it('counts a task of the project finished, but not one merely looked at', () => {
    const project = makeProject({ lastTouchedAt: ago(30) });
    const looked = makeTask({ projectId: project.id, touchedAt: ago(1) }); // triaged, kept, re-planned
    const finished = makeTask({ projectId: project.id, status: 'done', doneAt: ago(3), touchedAt: ago(3) });
    expect(lastWorkByProject([project], [], [looked]).get(project.id)).toEqual(ago(30));
    expect(lastWorkByProject([project], [], [looked, finished]).get(project.id)).toEqual(ago(3));
  });

  it('does not give one project another project\'s work', () => {
    const a = makeProject({ lastTouchedAt: ago(30) });
    const b = makeProject({ lastTouchedAt: ago(30) });
    const taskOfB = makeTask({ projectId: b.id });
    const last = lastWorkByProject([a, b], [makeSession({ taskId: taskOfB.id, startedAt: ago(1) })], [taskOfB]);
    expect(last.get(a.id)).toEqual(ago(30));
    expect(last.get(b.id)).toEqual(ago(1));
  });

  it('ignores unreadable dates', () => {
    const project = makeProject({ lastTouchedAt: ago(3) });
    // The schema would refuse such a row; a restored or hand-edited one might not.
    const bad = { projectId: project.id, taskId: null, startedAt: new Date('nope'), endedAt: null };
    expect(lastWorkByProject([project], [bad], []).get(project.id)).toEqual(ago(3));
  });

  it('does not let an unreadable lastTouchedAt hide real work', () => {
    // A NaN stored first would win every later comparison (anything > NaN is false).
    const project = { id: makeProject({}).id, lastTouchedAt: new Date('nope') };
    const session = { projectId: project.id, taskId: null, startedAt: ago(2), endedAt: null };
    expect(lastWorkByProject([project], [session], []).get(project.id)).toEqual(ago(2));
  });
});

describe('detectStalls', () => {
  const run = (projects: ReturnType<typeof makeProject>[], extra: { sessions?: ReturnType<typeof makeSession>[]; tasks?: ReturnType<typeof makeTask>[]; defaultDays?: number } = {}) =>
    detectStalls({ projects, sessions: extra.sessions ?? [], tasks: extra.tasks ?? [], now: now(), defaultDays: extra.defaultDays });

  it('flags an active project on the day it reaches the threshold, not a day before', () => {
    inZone('Europe/Helsinki', () => {
      const sixDays = makeProject({ lastTouchedAt: ago(6, 23, 59) });
      const sevenDays = makeProject({ lastTouchedAt: ago(7, 23, 59) });
      expect(run([sixDays, sevenDays]).map((s) => s.project.id)).toEqual([sevenDays.id]);
      expect(run([sevenDays])[0]).toMatchObject({ daysQuiet: 7, thresholdDays: 7 });
    });
  });

  it('only flags active projects: paused, done and dropped ones rest', () => {
    inZone('UTC', () => {
      const stale = { lastTouchedAt: ago(90) };
      const projects = (['active', 'paused', 'done', 'dropped'] as const).map((status) => makeProject({ ...stale, status }));
      expect(run(projects).map((s) => s.project.status)).toEqual(['active']);
    });
  });

  it('is cleared by a session on the project, on its task, or a finished task', () => {
    inZone('UTC', () => {
      const direct = makeProject({ lastTouchedAt: ago(40) });
      const viaTask = makeProject({ lastTouchedAt: ago(40) });
      const finished = makeProject({ lastTouchedAt: ago(40) });
      const untouched = makeProject({ lastTouchedAt: ago(40) });
      const task = makeTask({ projectId: viaTask.id });
      const doneTask = makeTask({ projectId: finished.id, status: 'done', doneAt: ago(2) });
      const sessions = [
        makeSession({ projectId: direct.id, startedAt: ago(1) }),
        makeSession({ taskId: task.id, startedAt: ago(1) }),
      ];
      const stalls = run([direct, viaTask, finished, untouched], { sessions, tasks: [task, doneTask] });
      expect(stalls.map((s) => s.project.id)).toEqual([untouched.id]);
    });
  });

  it('is not hidden by the weekly review touching the project\'s tasks', () => {
    inZone('UTC', () => {
      const project = makeProject({ lastTouchedAt: ago(20) });
      const triaged = [1, 2, 3].map((n) => makeTask({ projectId: project.id, touchedAt: ago(n) }));
      expect(run([project], { tasks: triaged })).toHaveLength(1);
    });
  });

  it('respects a per-project setting and a rhythm', () => {
    inZone('UTC', () => {
      const weekly = makeProject({ cadencePerWeek: 1, lastTouchedAt: ago(10) }); // threshold 14
      const eager = makeProject({ stallAfterDays: 3, lastTouchedAt: ago(4) });
      const lazy = makeProject({ stallAfterDays: 60, lastTouchedAt: ago(30) });
      expect(run([weekly, eager, lazy]).map((s) => s.project.id)).toEqual([eager.id]);
    });
  });

  it('uses the configurable default for a project with no rhythm of its own', () => {
    inZone('UTC', () => {
      const project = makeProject({ lastTouchedAt: ago(9) });
      expect(run([project], { defaultDays: 10 })).toHaveLength(0);
      expect(run([project], { defaultDays: 9 })).toHaveLength(1);
    });
  });

  it('orders the most recently quiet first, ties by id, and is deterministic', () => {
    inZone('UTC', () => {
      const a = makeProject({ lastTouchedAt: ago(30) });
      const b = makeProject({ lastTouchedAt: ago(8) });
      const c = makeProject({ lastTouchedAt: ago(8) });
      const d = makeProject({ lastTouchedAt: ago(15) });
      const expected = [b, c].sort((x, y) => (x.id < y.id ? -1 : 1)).map((p) => p.id).concat([d.id, a.id]);
      expect(run([a, b, c, d]).map((s) => s.project.id)).toEqual(expected);
      expect(run([d, c, b, a]).map((s) => s.project.id)).toEqual(expected);
    });
  });

  it('treats a project touched in the future as not quiet', () => {
    inZone('UTC', () => {
      expect(run([makeProject({ lastTouchedAt: ago(-3) })])).toHaveLength(0);
    });
  });

  it('never mutates or reorders its inputs', () => {
    inZone('UTC', () => {
      const projects = [makeProject({ lastTouchedAt: ago(30) }), makeProject({ lastTouchedAt: ago(9) })];
      const before = projects.map((p) => p.id);
      run(projects);
      expect(projects.map((p) => p.id)).toEqual(before);
    });
  });
});
