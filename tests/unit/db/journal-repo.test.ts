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

  it('a later note-only shutdown keeps the recorded decisions (P1)', async () => {
    const a = await taskRepo.create({ title: 'A: fix the hose', status: 'next' });
    const b = await taskRepo.create({ title: 'B: write the report', status: 'next' });
    await dayPlanRepo.upsert(DAY, { picks: [a.id, b.id], capacityMin: 180 });

    await journalRepo.applyShutdown({
      date: DAY,
      decisions: [
        { taskId: a.id, outcome: 'done' },
        { taskId: b.id, outcome: 'back' },
      ],
      now: new Date('2026-06-15T21:00:00'),
    });

    const afterNote = await journalRepo.applyShutdown({
      date: DAY,
      decisions: [],
      shutdownNote: 'Quiet evening.',
      now: new Date('2026-06-15T22:00:00'),
    });

    expect(afterNote.picksDone).toEqual([a.id]);
    expect(afterNote.picksBack).toEqual([b.id]);
    expect(afterNote.shutdownNote).toBe('Quiet evening.');
    expect((await taskRepo.getById(a.id))?.status).toBe('done');
    expect((await taskRepo.getById(b.id))?.status).toBe('next');
  });

  it('a later call naming only one task keeps the other decision (P2)', async () => {
    const a = await taskRepo.create({ title: 'A: fix the hose', status: 'next' });
    const b = await taskRepo.create({ title: 'B: write the report', status: 'next' });
    await dayPlanRepo.upsert(DAY, { picks: [a.id, b.id], capacityMin: 180 });
    await journalRepo.applyShutdown({
      date: DAY,
      decisions: [
        { taskId: a.id, outcome: 'done' },
        { taskId: b.id, outcome: 'back' },
      ],
      now: new Date('2026-06-15T21:00:00'),
    });

    const afterOne = await journalRepo.applyShutdown({
      date: DAY,
      decisions: [{ taskId: b.id, outcome: 'done' }],
      now: new Date('2026-06-15T22:00:00'),
    });

    expect(afterOne.picksDone).toEqual([a.id, b.id].sort());
    expect(afterOne.picksBack).toEqual([]);
  });

  it('deleting one task drops only that id, even from a later note-only call (P3)', async () => {
    const a = await taskRepo.create({ title: 'A: fix the hose', status: 'next' });
    const b = await taskRepo.create({ title: 'B: write the report', status: 'next' });
    await dayPlanRepo.upsert(DAY, { picks: [a.id, b.id], capacityMin: 180 });
    await journalRepo.applyShutdown({
      date: DAY,
      decisions: [
        { taskId: a.id, outcome: 'done' },
        { taskId: b.id, outcome: 'back' },
      ],
      now: new Date('2026-06-15T21:00:00'),
    });

    await taskRepo.delete(a.id);
    const afterDelete = await journalRepo.applyShutdown({
      date: DAY,
      decisions: [],
      shutdownNote: 'A is gone.',
      now: new Date('2026-06-15T22:00:00'),
    });

    expect(afterDelete.picksDone ?? []).not.toContain(a.id);
    expect(afterDelete.picksBack).toEqual([b.id]);
  });

  it('keeps the record consistent across random sequences through the repository (oracle)', async () => {
    let state = 13572468;
    const random = () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };

    const created = await Promise.all(
      ['A', 'B', 'C', 'D', 'E'].map((name, index) =>
        taskRepo.create({ title: `Task ${name}`, status: index === 0 ? 'scheduled' : 'next' }),
      ),
    );
    await dayPlanRepo.upsert(DAY, { picks: created.map((task) => task.id), capacityMin: 240 });

    /** What the record should be: the last outcome of each surviving task. */
    const model = new Map<string, 'done' | 'back'>();
    const deleted = new Set<string>();
    let now = new Date('2026-06-15T21:00:00').getTime();

    for (let call = 0; call < 14; call += 1) {
      now += 60_000;
      // Occasionally delete a task between calls.
      if (random() < 0.25) {
        const live = created.filter((task) => !deleted.has(task.id));
        if (live.length > 2) {
          const victim = live[Math.floor(random() * live.length)]!;
          await taskRepo.delete(victim.id);
          deleted.add(victim.id);
          model.delete(victim.id);
        }
      }

      const live = created.filter((task) => !deleted.has(task.id));
      const decisions = live
        .filter(() => random() < 0.5)
        .map((task) => ({ taskId: task.id, outcome: (random() < 0.5 ? 'done' : 'back') as 'done' | 'back' }));
      const input = {
        date: DAY,
        decisions,
        ...(random() < 0.3 ? { shutdownNote: `note ${call}` } : {}),
        now: new Date(now),
      };
      const saved = await journalRepo.applyShutdown(input);
      for (const decision of decisions) model.set(decision.taskId, decision.outcome);

      // 1. The record is the model: the last outcome per surviving task.
      const expectedDone = [...model.entries()].filter(([, outcome]) => outcome === 'done').map(([id]) => id).sort();
      const expectedBack = [...model.entries()].filter(([, outcome]) => outcome === 'back').map(([id]) => id).sort();
      expect(saved.picksDone ?? []).toEqual(expectedDone);
      expect(saved.picksBack ?? []).toEqual(expectedBack);

      // 2. No id in both lists, and every recorded id still has a task row.
      expect((saved.picksDone ?? []).filter((id) => (saved.picksBack ?? []).includes(id))).toEqual([]);
      for (const id of [...(saved.picksDone ?? []), ...(saved.picksBack ?? [])]) {
        expect(deleted.has(id), `recorded a deleted task ${id}`).toBe(false);
      }

      // 3. Task status invariants.
      for (const id of saved.picksDone ?? []) {
        const task = await taskRepo.getById(id);
        expect(task?.status).toBe('done');
      }
      for (const id of saved.picksBack ?? []) {
        const task = await taskRepo.getById(id);
        expect(task?.status).toBe('next');
        expect(task?.deferUntil ?? null).toBeNull();
      }

      // 4. Repeating the same call writes nothing at all.
      const stored = await journalRepo.findByDate(DAY);
      const repeat = await journalRepo.applyShutdown({ ...input, now: new Date(now + 30_000) });
      const afterRepeat = await journalRepo.findByDate(DAY);
      expect(afterRepeat).toEqual(stored);
      expect(repeat.updatedAt.getTime()).toBe(saved.updatedAt.getTime());
    }
  });

  it('refuses an invalid day key instead of writing a row nothing can read', async () => {
    await expect(journalRepo.findByDate('15/06/2026')).rejects.toThrow();
    await expect(journalRepo.saveJournal('2026-06-31', 'x')).rejects.toThrow();
  });
});
