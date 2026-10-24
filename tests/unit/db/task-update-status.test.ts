import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTesting } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';

/**
 * `updateStatus` exists for the review sweep: a decision can change a field and
 * the status together (defer = a new day + `scheduled`), and that pair must land
 * in one transaction or not at all.
 */
describe('taskRepo.updateStatus', () => {
  beforeEach(async () => {
    await resetDbForTesting();
  });

  it('applies the field patch and the status together', async () => {
    const task = await taskRepo.create({ title: 'Reply to the editor', status: 'next' });
    const updated = await taskRepo.updateStatus(
      task.id,
      { deferUntil: new Date(2026, 6, 1, 12) },
      'scheduled',
    );
    expect(updated.status).toBe('scheduled');
    expect(updated.deferUntil?.getTime()).toBe(new Date(2026, 6, 1, 12).getTime());
    const stored = await taskRepo.getById(task.id);
    expect(stored?.status).toBe('scheduled');
    expect(stored?.deferUntil?.getTime()).toBe(new Date(2026, 6, 1, 12).getTime());
  });

  it('bumps touchedAt so a kept task leaves the waiting window', async () => {
    const task = await taskRepo.create({ title: 'Kept as it is', status: 'next' });
    const before = task.touchedAt.getTime();
    const later = new Date(before + 60_000);
    const updated = await taskRepo.updateStatus(task.id, {}, 'next', later);
    expect(updated.touchedAt.getTime()).toBe(later.getTime());
  });

  it('sets doneAt exactly when the new status is done', async () => {
    const task = await taskRepo.create({ title: 'Finish the outline', status: 'next' });
    const now = new Date('2026-06-21T10:00:00Z');
    expect((await taskRepo.updateStatus(task.id, {}, 'done', now)).doneAt?.getTime()).toBe(now.getTime());
    expect((await taskRepo.updateStatus(task.id, {}, 'next', now)).doneAt).toBeNull();
  });

  it('refuses an illegal transition and leaves the row untouched', async () => {
    const task = await taskRepo.create({ title: 'Closed out', status: 'next' });
    await taskRepo.updateStatus(task.id, {}, 'done', new Date('2026-06-21T10:00:00Z'));
    // done -> scheduled is not a legal transition.
    await expect(taskRepo.updateStatus(task.id, { nextAction: 'y' }, 'scheduled')).rejects.toThrow();
    const stored = await taskRepo.getById(task.id);
    expect(stored?.status).toBe('done');
    expect(stored?.nextAction ?? null).toBeNull();
  });

  it('reports a missing task instead of writing a phantom row', async () => {
    await expect(
      taskRepo.updateStatus('11111111-1111-4111-8111-111111111111', {}, 'next'),
    ).rejects.toThrow(/not found/);
  });
});
