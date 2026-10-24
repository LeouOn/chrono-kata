import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { journalRepo } from '@/lib/db/journal.repo';
import { DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';
import { collectAll } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { DayPlanSchema } from '@/lib/schemas/day-plan';

/**
 * The backup round trip for a day the journal actually writes.
 *
 * W12 part 1 added `shutdownAt` (a Date) to DayPlan and the importer's hand-kept
 * date list did not know it, so every closed day was dropped on restore - found
 * by another seat after part 1 merged. This test is the one the wave's own bar
 * asks for: rows written by the REAL repositories, through export -> JSON ->
 * parse -> replaceAll, compared field by field.
 */

const DAY = '2026-06-15';
const QUIET_DAY = '2026-06-16';

beforeEach(async () => {
  await resetDbForTesting();
});

async function writeClosedDay(): Promise<{ doneId: string; backId: string }> {
  const done = await taskRepo.create({ title: 'Fix the hose', status: 'next' });
  const back = await taskRepo.create({ title: 'Write the report', status: 'next' });
  await dayPlanRepo.upsert(DAY, { picks: [done.id, back.id], capacityMin: 180 });
  await journalRepo.saveDayFields(DAY, {
    journal: 'Worked on position\nsizing.\n\nA quiet evening.',
    domainChecks: { [DOMAIN_SEED_IDS.trading]: true, [DOMAIN_SEED_IDS.practice]: false },
  });
  await journalRepo.applyShutdown({
    date: DAY,
    decisions: [
      { taskId: done.id, outcome: 'done' },
      { taskId: back.id, outcome: 'back' },
    ],
    shutdownNote: 'Left the trading review for tomorrow.',
    firstActionTomorrow: 'Start with trading prep.',
    now: new Date('2026-06-15T21:30:00'),
  });
  return { doneId: done.id, backId: back.id };
}

describe('a closed day through the backup envelope', () => {
  it('comes back whole: shutdown time, decisions, note, first move, ticks and journal', async () => {
    const { doneId, backId } = await writeClosedDay();
    // A second day with only a journal, so the round trip is not one row.
    await dayPlanRepo.upsert(QUIET_DAY, { picks: [], capacityMin: 0 });
    await journalRepo.saveDayFields(QUIET_DAY, { journal: 'Nothing much.' });

    const before = await collectAll();
    expect(before.dayPlans).toHaveLength(2);

    const parsed = parseEnvelope(JSON.stringify(before));
    if (!parsed.ok) throw new Error(parsed.error);
    // Nothing was dropped for being unreadable.
    expect(parsed.skipped).toBe(0);
    expect(parsed.envelope.dayPlans).toHaveLength(2);

    await resetDbForTesting();
    await replaceAll(parsed.envelope);

    const restored = await journalRepo.findByDate(DAY);
    expect(restored).not.toBeNull();
    expect(restored?.shutdownAt).toBeInstanceOf(Date);
    expect(restored?.shutdownAt?.getTime()).toBe(new Date('2026-06-15T21:30:00').getTime());
    expect(restored?.picksDone).toEqual([doneId]);
    expect(restored?.picksBack).toEqual([backId]);
    expect(restored?.shutdownNote).toBe('Left the trading review for tomorrow.');
    expect(restored?.firstActionTomorrow).toBe('Start with trading prep.');
    expect(restored?.domainChecks).toEqual({
      [DOMAIN_SEED_IDS.trading]: true,
      [DOMAIN_SEED_IDS.practice]: false,
    });
    expect(restored?.journal).toBe('Worked on position\nsizing.\n\nA quiet evening.');
    expect(DayPlanSchema.safeParse(restored).success).toBe(true);

    // The quiet day kept its absent shutdown: no invented timestamp.
    const quiet = await journalRepo.findByDate(QUIET_DAY);
    expect(quiet?.journal).toBe('Nothing much.');
    expect(quiet?.shutdownAt ?? null).toBeNull();
  });

  it('changes nothing when the same backup is imported twice', async () => {
    await writeClosedDay();
    const first = parseEnvelope(JSON.stringify(await collectAll()));
    if (!first.ok) throw new Error(first.error);
    await replaceAll(first.envelope);
    const afterFirst = await journalRepo.findByDate(DAY);

    const second = parseEnvelope(JSON.stringify(await collectAll()));
    if (!second.ok) throw new Error(second.error);
    await replaceAll(second.envelope);
    const afterSecond = await journalRepo.findByDate(DAY);

    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond?.shutdownAt?.getTime()).toBe(afterFirst?.shutdownAt?.getTime());
  });

  it('keeps a local closed day when the file predates the journal fields', async () => {
    await writeClosedDay();
    const before = await journalRepo.findByDate(DAY);

    // A legacy envelope: same shape, no dayPlans key at all.
    const envelope = await collectAll();
    const legacy = { ...envelope } as Record<string, unknown>;
    delete legacy.dayPlans;
    const parsed = parseEnvelope(JSON.stringify(legacy));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.envelope.dayPlans).toBeUndefined();

    await replaceAll(parsed.envelope);
    expect(await journalRepo.findByDate(DAY)).toEqual(before);
  });

  it('survives a shutdown written and restored a second time (multi-day oracle)', async () => {
    const days = ['2026-06-01', '2026-06-02', '2026-06-03'];
    const taskIds: string[] = [];
    for (const [index, day] of days.entries()) {
      const task = await taskRepo.create({ title: `Task ${index}`, status: 'next' });
      taskIds.push(task.id);
      await dayPlanRepo.upsert(day, { picks: [task.id], capacityMin: 60 });
      await journalRepo.applyShutdown({
        date: day,
        decisions: [{ taskId: task.id, outcome: index % 2 === 0 ? 'done' : 'back' }],
        shutdownNote: `note ${index}`,
        now: new Date(`${day}T21:00:00`),
      });
    }
    const before = await getDb().dayPlans.toArray();

    const parsed = parseEnvelope(JSON.stringify(await collectAll()));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.skipped).toBe(0);
    await resetDbForTesting();
    await replaceAll(parsed.envelope);

    const after = await getDb().dayPlans.toArray();
    expect(after).toHaveLength(3);
    const byDate = new Map(after.map((row) => [row.date, row] as const));
    for (const row of before) {
      const restored = byDate.get(row.date);
      expect(restored, `day ${row.date} missing after restore`).toBeDefined();
      expect(restored?.shutdownAt?.getTime()).toBe(row.shutdownAt?.getTime());
      expect(restored?.picksDone).toEqual(row.picksDone);
      expect(restored?.picksBack).toEqual(row.picksBack);
      expect(restored?.shutdownNote).toBe(row.shutdownNote);
    }
  });
});
