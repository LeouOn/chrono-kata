import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { sessionRepo } from '@/lib/db/session.repo';
import { taskRepo } from '@/lib/db/task.repo';
import type { SessionInput } from '@/lib/schemas/session';

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function input(overrides: Partial<SessionInput> = {}): SessionInput {
  return {
    startedAt: new Date(2026, 9, 23, 9, 0),
    durationMinutes: 25,
    rating: 4,
    ...overrides,
  };
}

async function seedTask(title = 'write report') {
  return taskRepo.create({ title, status: 'next', source: 'manual' });
}

async function actualMinOf(taskId: string): Promise<number | null | undefined> {
  return (await taskRepo.getById(taskId))?.actualMin;
}

describe('actualMin stays a truthful cache of linked sessions', () => {
  it('sums linked sessions on save', async () => {
    const task = await seedTask();
    await sessionRepo.save(input({ taskId: task.id, durationMinutes: 25 }));
    await sessionRepo.save(input({ taskId: task.id, durationMinutes: 10 }));
    expect(await actualMinOf(task.id)).toBe(35);
  });

  it('recomputes on edit of the minutes', async () => {
    const task = await seedTask();
    const first = await sessionRepo.save(input({ taskId: task.id, durationMinutes: 22.25 }));
    await sessionRepo.save(input({ taskId: task.id, durationMinutes: 20 }));
    expect(await actualMinOf(task.id)).toBe(42.25);

    await sessionRepo.update(first.id, { durationMinutes: 81.5 });
    expect(await actualMinOf(task.id)).toBe(101.5);
  });

  it('recomputes on delete', async () => {
    const task = await seedTask();
    const first = await sessionRepo.save(input({ taskId: task.id, durationMinutes: 22.25 }));
    await sessionRepo.save(input({ taskId: task.id, durationMinutes: 61.5 }));
    expect(await actualMinOf(task.id)).toBe(83.75);

    await sessionRepo.delete(first.id);
    expect(await actualMinOf(task.id)).toBe(61.5);
  });

  it('recomputes the old task when a session is unlinked', async () => {
    const task = await seedTask();
    const session = await sessionRepo.save(input({ taskId: task.id, durationMinutes: 30 }));
    expect(await actualMinOf(task.id)).toBe(30);

    await sessionRepo.update(session.id, { taskId: null });
    expect(await actualMinOf(task.id)).toBeNull();
  });

  it('recomputes both tasks when a session is relinked', async () => {
    const first = await seedTask('first');
    const second = await seedTask('second');
    const session = await sessionRepo.save(input({ taskId: first.id, durationMinutes: 40 }));
    await sessionRepo.save(input({ taskId: first.id, durationMinutes: 60 }));
    expect(await actualMinOf(first.id)).toBe(100);

    await sessionRepo.update(session.id, { taskId: second.id });
    expect(await actualMinOf(first.id)).toBe(60);
    expect(await actualMinOf(second.id)).toBe(40);
  });

  it('does not recompute for a patch that cannot affect minutes', async () => {
    const task = await seedTask();
    const session = await sessionRepo.save(input({ taskId: task.id, durationMinutes: 25 }));

    // Pretend a future manual override exists: a note-only edit must not touch it.
    await getDb().tasks.put({ ...(await taskRepo.getById(task.id))!, actualMin: 999 });

    await sessionRepo.update(session.id, { note: 'felt good' });
    expect(await actualMinOf(task.id)).toBe(999);

    // A minutes edit does recompute, overwriting the stale value.
    await sessionRepo.update(session.id, { durationMinutes: 30 });
    expect(await actualMinOf(task.id)).toBe(30);
  });

  it('rolls the session edit back when the task write fails', async () => {
    const task = await seedTask();
    const session = await sessionRepo.save(input({ taskId: task.id, durationMinutes: 25 }));
    const db = getDb();
    const putSpy = vi.spyOn(db.tasks, 'put').mockRejectedValueOnce(new Error('task write failed'));

    await expect(sessionRepo.update(session.id, { durationMinutes: 60 })).rejects.toThrow(
      /task write failed/,
    );

    expect((await sessionRepo.getById(session.id))?.durationMinutes).toBe(25);
    putSpy.mockRestore();
    expect(await actualMinOf(task.id)).toBe(25);
  });

  it('rolls the session delete back when the task write fails', async () => {
    const task = await seedTask();
    await sessionRepo.save(input({ taskId: task.id, durationMinutes: 25 }));
    const session = await sessionRepo.save(input({ taskId: task.id, durationMinutes: 10 }));
    const db = getDb();
    vi.spyOn(db.tasks, 'put').mockRejectedValueOnce(new Error('task write failed'));

    await expect(sessionRepo.delete(session.id)).rejects.toThrow(/task write failed/);

    expect(await getDb().sessions.count()).toBe(2);
    expect(await actualMinOf(task.id)).toBe(35);
  });

  it('ignores an orphaned task instead of failing the session write', async () => {
    const missingId = '99999999-9999-4999-8999-999999999999';
    const session = await sessionRepo.save(input({ taskId: missingId, durationMinutes: 10 }));
    expect(session.taskId).toBe(missingId);
    expect(await getDb().sessions.count()).toBe(1);
  });

  it('recomputes with 30-second precision', async () => {
    const task = await seedTask();
    const session = await sessionRepo.save(input({ taskId: task.id, durationMinutes: 1.5 }));
    await sessionRepo.save(input({ taskId: task.id, durationMinutes: 0.75 }));
    expect(await actualMinOf(task.id)).toBe(2.25);

    await sessionRepo.update(session.id, { durationMinutes: 2 });
    expect(await actualMinOf(task.id)).toBe(2.75);
  });

  it('clears the cache to null when the last linked session is unlinked or deleted', async () => {
    const task = await seedTask();
    const session = await sessionRepo.save(input({ taskId: task.id, durationMinutes: 15 }));
    await sessionRepo.update(session.id, { taskId: null });
    expect(await actualMinOf(task.id)).toBeNull();

    await sessionRepo.update(session.id, { taskId: task.id });
    expect(await actualMinOf(task.id)).toBe(15);
    await sessionRepo.delete(session.id);
    expect(await actualMinOf(task.id)).toBeNull();
  });
});
