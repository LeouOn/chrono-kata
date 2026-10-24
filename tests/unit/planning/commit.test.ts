import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { blockRepo } from '@/lib/db/block.repo';
import { commitLayout } from '@/lib/planning/commit';

const DAY = '2026-06-15';
const WINDOW = { start: new Date(2026, 5, 15, 9).getTime(), end: new Date(2026, 5, 15, 17).getTime() };
const NOW = new Date(2026, 5, 15, 10).getTime();
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';

beforeEach(async () => {
  await resetDbForTesting();
});

describe('commitLayout', () => {
  it('puts overflow tasks back to next and writes the remaining picks in one transaction', async () => {
    const t2 = await taskRepo.create({ title: 'overflow', status: 'scheduled', source: 'manual' });
    await dayPlanRepo.upsert(DAY, { picks: [T1, t2.id], capacityMin: 120 });
    await commitLayout({
      dayKey: DAY,
      window: WINDOW,
      now: NOW,
      blocks: [],
      overflowTaskIds: [t2.id],
      picks: [T1],
    });
    const plan = await dayPlanRepo.getByDate(DAY);
    expect(plan?.picks).toEqual([T1]);
    expect((await taskRepo.getById(t2.id))?.status).toBe('next');
  });

  it('rolls back blocks, picks and task status together when a write fails', async () => {
    const t2 = await taskRepo.create({ title: 'overflow', status: 'scheduled', source: 'manual' });
    await dayPlanRepo.upsert(DAY, { picks: [T1, t2.id], capacityMin: 120 });
    const existing = await blockRepo.create({
      start: new Date(2026, 5, 15, 11),
      end: new Date(2026, 5, 15, 12),
      kind: 'focus',
      title: 'Focus',
      taskId: T1,
    });
    await expect(
      commitLayout({
        dayKey: DAY,
        window: WINDOW,
        now: NOW,
        blocks: [
          { taskId: T1, start: new Date(2026, 5, 15, 13).getTime(), end: new Date(2026, 5, 15, 14).getTime() },
          { taskId: T2, start: new Date(2026, 5, 15, 15).getTime(), end: new Date(2026, 5, 15, 14).getTime() },
        ],
        overflowTaskIds: [t2.id],
        picks: [T1],
      }),
    ).rejects.toThrow();
    const plan = await dayPlanRepo.getByDate(DAY);
    expect(plan?.picks).toEqual([T1, t2.id]);
    expect((await taskRepo.getById(t2.id))?.status).toBe('scheduled');
    const db = await getDb();
    expect(await db.blocks.count()).toBe(1);
    expect((await blockRepo.getById(existing.id))?.start.getHours()).toBe(11);
  });
});
