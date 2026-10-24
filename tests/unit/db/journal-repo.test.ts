import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { journalRepo } from '@/lib/db/journal.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';
import { DayPlanSchema } from '@/lib/schemas/day-plan';
import type { DayPlan } from '@/lib/schemas/day-plan';

const DAY = '2026-06-15';
const NEXT_DAY = '2026-06-16';

function plan(patch: Partial<DayPlan> & { date: string }): DayPlan {
  const t = new Date('2026-06-15T07:00:00');
  return { picks: [], capacityMin: 120, createdAt: t, updatedAt: t, ...patch } as DayPlan;
}

beforeEach(async () => {
  await resetDbForTesting();
});

describe('journalRepo', () => {
  it('returns null for a day with no plan', async () => {
    expect(await journalRepo.findByDate(DAY)).toBeNull();
  });

  it('saves the journal text and creates a bare plan when the day has none', async () => {
    const saved = await journalRepo.saveJournal(DAY, 'A calm day.\r\n\r\nPractice was short.');
    expect(saved.date).toBe(DAY);
    expect(saved.journal).toBe('A calm day.\n\nPractice was short.');
    expect(saved.picks).toEqual([]);
    expect(DayPlanSchema.safeParse(saved).success).toBe(true);
    expect(await journalRepo.findByDate(DAY)).toEqual(saved);
  });

  it('keeps the picks and the original createdAt when the journal is edited', async () => {
    const task = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(DAY, { picks: [task.id], capacityMin: 180 });
    const before = await journalRepo.findByDate(DAY);

    const saved = await journalRepo.saveJournal(DAY, 'First words.');
    expect(saved.picks).toEqual([task.id]);
    expect(saved.createdAt.getTime()).toBe(before!.createdAt.getTime());
    expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());
  });

  it('refuses text the day plan cannot store, without writing anything', async () => {
    await expect(journalRepo.saveJournal(DAY, 'x'.repeat(5001))).rejects.toThrow();
    expect(await journalRepo.findByDate(DAY)).toBeNull();
  });

  it('applies a shutdown: task outcomes and the day in one transaction', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    const returned = await taskRepo.create({ title: 'Write the report', status: 'next' });
    const waiting = await taskRepo.create({ title: 'Reply to the editor', status: 'waiting' });
    await dayPlanRepo.upsert(DAY, { picks: [finished.id, returned.id, waiting.id], capacityMin: 180 });

    const saved = await journalRepo.applyShutdown({
      date: DAY,
      decisions: [
        { taskId: finished.id, outcome: 'done' },
        { taskId: returned.id, outcome: 'back' },
        { taskId: waiting.id, outcome: 'back' },
      ],
      shutdownNote: 'Left the review for tomorrow.',
      firstActionTomorrow: 'Start with trading prep.',
      domainChecks: { [DOMAIN_SEED_IDS.trading]: true, [DOMAIN_SEED_IDS.practice]: false },
      now: new Date('2026-06-15T21:00:00'),
    });

    expect(saved.picksDone).toEqual([finished.id]);
    expect([...(saved.picksBack ?? [])].sort()).toEqual([returned.id, waiting.id].sort());
    expect(saved.firstActionTomorrow).toBe('Start with trading prep.');
    expect(saved.shutdownAt?.getTime()).toBe(new Date('2026-06-15T21:00:00').getTime());

    expect((await taskRepo.getById(finished.id))?.status).toBe('done');
    expect((await taskRepo.getById(finished.id))?.doneAt).not.toBeNull();
    expect((await taskRepo.getById(returned.id))?.status).toBe('next');
    expect((await taskRepo.getById(waiting.id))?.status).toBe('next');
  });

  it('is idempotent: a second identical shutdown writes nothing at all', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(DAY, { picks: [finished.id], capacityMin: 180 });
    const input = {
      date: DAY,
      decisions: [{ taskId: finished.id, outcome: 'done' as const }],
      shutdownNote: 'Done.',
      now: new Date('2026-06-15T21:00:00'),
    };

    const first = await journalRepo.applyShutdown(input);
    const storedFirst = await journalRepo.findByDate(DAY);
    const second = await journalRepo.applyShutdown({ ...input, now: new Date('2026-06-15T22:30:00') });
    const storedSecond = await journalRepo.findByDate(DAY);

    expect(second).toEqual(first);
    // Not just equal in content: the row was not rewritten, so updatedAt is the
    // same instant as after the first shutdown.
    expect(storedSecond).toEqual(storedFirst);
    expect(storedSecond?.updatedAt.getTime()).toBe(first.updatedAt.getTime());
  });

  it('rolls the whole shutdown back when a task write fails', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    await dayPlanRepo.upsert(DAY, { picks: [finished.id], capacityMin: 180 });
    const before = await journalRepo.findByDate(DAY);

    const spy = vi.spyOn(getDb().tasks, 'put').mockRejectedValueOnce(new Error('storage went away'));
    await expect(
      journalRepo.applyShutdown({
        date: DAY,
        decisions: [{ taskId: finished.id, outcome: 'done' }],
        shutdownNote: 'should not stick',
        now: new Date('2026-06-15T21:00:00'),
      }),
    ).rejects.toThrow('storage went away');
    spy.mockRestore();

    // Neither the day nor the task kept anything.
    expect(await journalRepo.findByDate(DAY)).toEqual(before);
    expect((await taskRepo.getById(finished.id))?.status).toBe('next');
  });

  it('skips a decision for a task that was deleted underneath it', async () => {
    const kept = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    const gone = await taskRepo.create({ title: 'Vanished', status: 'next' });
    await dayPlanRepo.upsert(DAY, { picks: [kept.id, gone.id], capacityMin: 180 });
    await taskRepo.delete(gone.id);

    const saved = await journalRepo.applyShutdown({
      date: DAY,
      decisions: [
        { taskId: kept.id, outcome: 'back' },
        { taskId: gone.id, outcome: 'done' },
      ],
      now: new Date('2026-06-15T21:00:00'),
    });

    expect(saved.picksDone).toEqual([]);
    expect(saved.picksBack).toEqual([kept.id]);
    expect((await taskRepo.getById(kept.id))?.status).toBe('next');
  });

  it('writes a shutdown for a day with no plan by creating the bare day', async () => {
    const finished = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
    const saved = await journalRepo.applyShutdown({
      date: NEXT_DAY,
      decisions: [{ taskId: finished.id, outcome: 'done' }],
      now: new Date('2026-06-16T21:00:00'),
    });
    expect(saved.date).toBe(NEXT_DAY);
    expect(saved.picksDone).toEqual([finished.id]);
    expect(DayPlanSchema.safeParse(saved).success).toBe(true);
  });

  it('refuses an invalid day key instead of writing a row nothing can read', async () => {
    await expect(journalRepo.findByDate('15/06/2026')).rejects.toThrow();
    await expect(journalRepo.saveJournal('2026-06-31', 'x')).rejects.toThrow();
  });
});
