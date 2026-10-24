/**
 * Project.breadcrumbAt: the time the project's note last CHANGED.
 *
 * `updatedAt` moves on every write to the row, so it cannot say whether the
 * project's own note or a later session's note is the newer one. The repository
 * stamps `breadcrumbAt`, and only when the note's text changes, so pausing a
 * project in the weekly review or editing its rhythm cannot make an old note look
 * new. These tests pin that, and that nothing a caller passes can forge it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { projectRepo } from '@/lib/db/project.repo';
import { saveSessionWithOutcome } from '@/lib/db/session-outcome.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { ProjectSchema } from '@/lib/schemas/project';

const T0 = new Date(2026, 5, 1, 9, 0);
const T1 = new Date(2026, 5, 10, 9, 0);
const T2 = new Date(2026, 5, 17, 9, 0);

beforeEach(async () => {
  await resetDbForTesting();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('create', () => {
  it('stamps the note\'s time when there is a note', async () => {
    const project = await projectRepo.create({ title: 'Garden', status: 'active', breadcrumb: 'buy seeds' });
    expect(project.breadcrumbAt).toEqual(T0);
    expect((await projectRepo.getById(project.id))?.breadcrumbAt).toEqual(T0);
  });

  it('stamps nothing for no note, or a blank one', async () => {
    const none = await projectRepo.create({ title: 'A', status: 'active' });
    const blank = await projectRepo.create({ title: 'B', status: 'active', breadcrumb: '   ' });
    const nul = await projectRepo.create({ title: 'C', status: 'active', breadcrumb: null });
    for (const project of [none, blank, nul]) expect(project.breadcrumbAt ?? null).toBeNull();
  });
});

describe('update', () => {
  it('does NOT move the stamp for an unrelated edit, though updatedAt moves (the review\'s pause, a cadence change)', async () => {
    const project = await projectRepo.create({ title: 'Garden', status: 'active', breadcrumb: 'buy seeds' });
    vi.setSystemTime(T2);
    const paused = await projectRepo.update(project.id, { status: 'paused' });
    const rhythm = await projectRepo.update(project.id, { cadencePerWeek: 2, cadenceBlockMin: 45 });
    const renamed = await projectRepo.update(project.id, { title: 'Back garden' });
    for (const after of [paused, rhythm, renamed]) {
      expect(after.breadcrumbAt).toEqual(T0); // still when the note was written
      expect(after.updatedAt).toEqual(T2); // but the row did change
    }
  });

  it('does not move the stamp when the same note is sent again, even with different spacing', async () => {
    const project = await projectRepo.create({ title: 'Garden', status: 'active', breadcrumb: 'buy seeds' });
    vi.setSystemTime(T2);
    const same = await projectRepo.update(project.id, { breadcrumb: 'buy seeds' });
    const spaced = await projectRepo.update(project.id, { breadcrumb: '  buy seeds  ' });
    expect(same.breadcrumbAt).toEqual(T0);
    expect(spaced.breadcrumbAt).toEqual(T0);
  });

  it('moves the stamp when the note\'s text changes, and when it is cleared', async () => {
    const project = await projectRepo.create({ title: 'Garden', status: 'active', breadcrumb: 'buy seeds' });
    vi.setSystemTime(T1);
    expect((await projectRepo.update(project.id, { breadcrumb: 'edge the bed' })).breadcrumbAt).toEqual(T1);
    vi.setSystemTime(T2);
    const cleared = await projectRepo.update(project.id, { breadcrumb: null });
    expect(cleared.breadcrumbAt).toEqual(T2);
    expect(cleared.breadcrumb).toBeNull();
  });

  it('stamps the first note on a project that had none', async () => {
    const project = await projectRepo.create({ title: 'Garden', status: 'active' });
    vi.setSystemTime(T1);
    expect((await projectRepo.update(project.id, { breadcrumb: 'start here' })).breadcrumbAt).toEqual(T1);
  });

  it('cannot be set by a caller: a passed breadcrumbAt is ignored', async () => {
    const project = await projectRepo.create({ title: 'Garden', status: 'active', breadcrumb: 'buy seeds' });
    vi.setSystemTime(T2);
    const forged = await projectRepo.update(project.id, { cadencePerWeek: 1, breadcrumbAt: new Date(2030, 0, 1) } as never);
    expect(forged.breadcrumbAt).toEqual(T0);
  });

  it('is not touched by touch() (a session on the project is not a new note by itself)', async () => {
    const project = await projectRepo.create({ title: 'Garden', status: 'active', breadcrumb: 'buy seeds' });
    const touched = await projectRepo.touch(project.id, T2);
    expect(touched.breadcrumbAt).toEqual(T0);
    expect(touched.lastTouchedAt).toEqual(T2);
  });

  it('leaves a row from before the field alone: still valid, still unstamped', async () => {
    const created = await projectRepo.create({ title: 'Old row', status: 'active', breadcrumb: 'old note' });
    const { breadcrumbAt: _gone, ...legacy } = created;
    await getDb().projects.put(legacy as typeof created);
    expect(ProjectSchema.safeParse(legacy).success).toBe(true);
    vi.setSystemTime(T2);
    const edited = await projectRepo.update(created.id, { cadencePerWeek: 3 });
    expect(edited.breadcrumbAt ?? null).toBeNull(); // unrelated edit: still no stamp
    const rewritten = await projectRepo.update(created.id, { breadcrumb: 'a new note' });
    expect(rewritten.breadcrumbAt).toEqual(T2); // written now: stamped from here on
  });
});

describe('the real end-of-session path (a session on the project writes its note)', () => {
  it('stamps the note when a project session leaves a new one, and not when it repeats it', async () => {
    const project = await projectRepo.create({ title: 'Garden', status: 'active', breadcrumb: 'buy seeds' });
    vi.setSystemTime(T1);
    const first = await saveSessionWithOutcome(
      { startedAt: T1, durationMinutes: 20, reps: null, rating: 3, projectId: project.id, breadcrumb: 'edge the bed' } as Parameters<typeof saveSessionWithOutcome>[0],
      T1,
    );
    expect(first.ok && first.project?.breadcrumbAt).toEqual(T1);

    vi.setSystemTime(T2);
    const repeat = await saveSessionWithOutcome(
      { startedAt: T2, durationMinutes: 20, reps: null, rating: 3, projectId: project.id, breadcrumb: 'edge the bed' } as Parameters<typeof saveSessionWithOutcome>[0],
      T2,
    );
    expect(repeat.ok && repeat.project?.breadcrumbAt).toEqual(T1); // same text: the note did not change
    expect(repeat.ok && repeat.project?.lastTouchedAt).toEqual(T2); // but the project was worked on
  });

  it('a session on a TASK does not write the project\'s note at all', async () => {
    const project = await projectRepo.create({ title: 'Garden', status: 'active', breadcrumb: 'buy seeds' });
    const task = await taskRepo.create({ title: 'Edge the bed', status: 'next', projectId: project.id, source: 'manual' });
    vi.setSystemTime(T2);
    await saveSessionWithOutcome(
      { startedAt: T2, durationMinutes: 20, reps: null, rating: 3, taskId: task.id, breadcrumb: 'next: mulch' } as Parameters<typeof saveSessionWithOutcome>[0],
      T2,
    );
    const after = await projectRepo.getById(project.id);
    expect(after?.breadcrumb).toBe('buy seeds');
    expect(after?.breadcrumbAt).toEqual(T0);
  });
});
