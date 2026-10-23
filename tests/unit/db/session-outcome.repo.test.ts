import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { projectRepo } from '@/lib/db/project.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { saveSessionWithOutcome } from '@/lib/db/session-outcome.repo';
import type { SessionInput } from '@/lib/schemas/session';

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function timedSession(overrides: Partial<SessionInput> = {}): SessionInput {
  return {
    startedAt: new Date(2026, 9, 23, 9, 0),
    endedAt: new Date(2026, 9, 23, 9, 25),
    durationMinutes: 25,
    rating: 4,
    ...overrides,
  };
}

async function seedTask(overrides: Parameters<typeof taskRepo.create>[0] extends never ? never : object = {}) {
  return taskRepo.create({
    title: 'write the report',
    status: 'next',
    source: 'manual',
    ...overrides,
  });
}

async function seedProject() {
  return projectRepo.create({ title: 'report', status: 'active' });
}

describe('saveSessionWithOutcome', () => {
  it('writes the session, the task minutes/status and the project breadcrumb together', async () => {
    const task = await seedTask({ actualMin: 10 });
    const project = await seedProject();
    const now = new Date(2026, 9, 23, 10, 0);

    const result = await saveSessionWithOutcome(
      timedSession({
        taskId: task.id,
        projectId: project.id,
        outcome: 'progress',
        breadcrumb: 'Pick up here next time: edit section 2',
      }),
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await getDb().sessions.count()).toBe(1);
    expect(result.session.taskId).toBe(task.id);

    const storedTask = await taskRepo.getById(task.id);
    expect(storedTask?.actualMin).toBe(35);
    expect(storedTask?.nextAction).toBe('edit section 2');
    expect(storedTask?.status).toBe('next');

    const storedProject = await projectRepo.getById(project.id);
    expect(storedProject?.breadcrumb).toBe('edit section 2');
    expect(storedProject?.lastTouchedAt.getTime()).toBe(now.getTime());
  });

  it('applies the done outcome to the task status', async () => {
    const task = await seedTask({ status: 'scheduled' });
    const result = await saveSessionWithOutcome(
      timedSession({ taskId: task.id, outcome: 'done', breadcrumb: 'finished' }),
    );
    expect(result.ok).toBe(true);
    const stored = await taskRepo.getById(task.id);
    expect(stored?.status).toBe('done');
    expect(stored?.doneAt).toBeInstanceOf(Date);
  });

  it('leaves practice sessions exactly as before', async () => {
    const result = await saveSessionWithOutcome(timedSession({ outcome: 'done', breadcrumb: 'not linked' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.task).toBeUndefined();
    expect(result.plan.project).toBeUndefined();
    expect(await getDb().sessions.count()).toBe(1);
    expect(await getDb().tasks.count()).toBe(0);
    expect(await getDb().projects.count()).toBe(0);
    // The ordinary conversation write still happened.
    expect(result.session.conversationId).toBeTruthy();
    expect(await getDb().conversations.count()).toBe(1);
  });

  it('refuses a project session without a breadcrumb and writes nothing', async () => {
    const task = await seedTask();
    const project = await seedProject();
    const result = await saveSessionWithOutcome(
      timedSession({ taskId: task.id, projectId: project.id, outcome: 'progress', breadcrumb: '   ' }),
    );
    expect(result).toMatchObject({ ok: false, reason: 'project-breadcrumb-required' });
    expect(await getDb().sessions.count()).toBe(0);
    expect(await getDb().conversations.count()).toBe(0);
    expect((await taskRepo.getById(task.id))?.actualMin ?? 0).toBe(0);
    expect((await projectRepo.getById(project.id))?.breadcrumb ?? null).toBeNull();
  });

  it('rolls the whole thing back when the task update fails', async () => {
    const task = await seedTask({ actualMin: 10 });
    const project = await seedProject();
    vi.spyOn(taskRepo, 'update').mockRejectedValue(new Error('disk on fire'));

    await expect(
      saveSessionWithOutcome(
        timedSession({
          taskId: task.id,
          projectId: project.id,
          outcome: 'progress',
          breadcrumb: 'chapter 2',
        }),
      ),
    ).rejects.toThrow(/disk on fire/);

    // Nothing persisted: no session, no conversation, no task/project change.
    expect(await getDb().sessions.count()).toBe(0);
    expect(await getDb().conversations.count()).toBe(0);
    const storedTask = await taskRepo.getById(task.id);
    expect(storedTask?.actualMin).toBe(10);
    expect(storedTask?.nextAction ?? null).toBeNull();
    const storedProject = await projectRepo.getById(project.id);
    expect(storedProject?.breadcrumb ?? null).toBeNull();
  });

  it('rolls back when the project update fails after the session is staged', async () => {
    const task = await seedTask();
    const project = await seedProject();
    vi.spyOn(projectRepo, 'update').mockRejectedValue(new Error('project write failed'));

    await expect(
      saveSessionWithOutcome(
        timedSession({
          taskId: task.id,
          projectId: project.id,
          outcome: 'progress',
          breadcrumb: 'chapter 3',
        }),
      ),
    ).rejects.toThrow(/project write failed/);

    expect(await getDb().sessions.count()).toBe(0);
    expect(await getDb().conversations.count()).toBe(0);
    const storedTask = await taskRepo.getById(task.id);
    expect(storedTask?.actualMin ?? 0).toBe(0);
    expect(storedTask?.nextAction ?? null).toBeNull();
  });

  it('sums several sessions on the same task', async () => {
    const task = await seedTask({ actualMin: 5 });
    await saveSessionWithOutcome(
      timedSession({ taskId: task.id, durationMinutes: 10, outcome: 'progress', breadcrumb: 'a' }),
    );
    await saveSessionWithOutcome(
      timedSession({ taskId: task.id, durationMinutes: 12.5, outcome: 'progress', breadcrumb: 'b' }),
    );
    expect((await taskRepo.getById(task.id))?.actualMin).toBe(27.5);
  });

  it('rejects a session whose linked task disappeared, without writing', async () => {
    const missingId = '99999999-9999-4999-8999-999999999999';
    await expect(
      saveSessionWithOutcome(timedSession({ taskId: missingId, outcome: 'progress' })),
    ).rejects.toThrow(/not found/);
    expect(await getDb().sessions.count()).toBe(0);
  });

  it('keeps the ordinary save path for sessions with stale/absent links', async () => {
    // No links: sessionRepo.save is used (still one conversation row), no tx needed.
    const session = await sessionRepo.save(timedSession());
    expect(session.id).toBeTruthy();
    expect(await getDb().conversations.count()).toBe(1);
  });
});
