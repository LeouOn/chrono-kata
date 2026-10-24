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
  it('keeps a confirmed plan untouched when no pick overflowed', async () => {
    await dayPlanRepo.upsert(DAY, { picks: [T2], capacityMin: 120 });
    await commitLayout({
      dayKey: DAY,
      window: WINDOW,
      now: NOW,
      blocks: [{ taskId: T2, start: new Date(2026, 5, 15, 11).getTime(), end: new Date(2026, 5, 15, 11, 30).getTime() }],
    });
    const plan = await dayPlanRepo.getByDate(DAY);
    expect(plan?.picks).toEqual([T2]);
    expect(plan?.capacityMin).toBe(120);
  });

  it('removes only overflow ids from a confirmed plan and keeps its order and fields', async () => {
    await dayPlanRepo.upsert(DAY, { picks: [T1, T2], capacityMin: 90, shutdownNote: 'keep me' });
    await commitLayout({
      dayKey: DAY,
      window: WINDOW,
      now: NOW,
      blocks: [],
      overflowTaskIds: [T2],
    });
    const plan = await dayPlanRepo.getByDate(DAY);
    expect(plan?.picks).toEqual([T1]);
    expect(plan?.capacityMin).toBe(90);
    expect(plan?.shutdownNote).toBe('keep me');
  });

  it('never fabricates a plan when none exists', async () => {
    await commitLayout({
      dayKey: DAY,
      window: WINDOW,
      now: NOW,
      blocks: [],
      overflowTaskIds: [T2],
    });
    expect(await dayPlanRepo.getByDate(DAY)).toBeUndefined();
  });

  it('leaves a done task in overflow exactly as it was and schema-valid', async () => {
    const done = await taskRepo.create({ title: 'done', status: 'next', source: 'manual' });
    await taskRepo.setStatus(done.id, 'done');
    await commitLayout({
      dayKey: DAY,
      window: WINDOW,
      now: NOW,
      blocks: [],
      overflowTaskIds: [done.id],
    });
    const after = await taskRepo.getById(done.id);
    expect(after?.status).toBe('done');
    expect(after?.doneAt).toBeInstanceOf(Date);
    expect(after?.nextAction).toBe(done.nextAction);
  });

  it('deletes future focus blocks but keeps started blocks and non-focus blocks', async () => {
    const started = await blockRepo.create({
      start: new Date(2026, 5, 15, 9),
      end: new Date(2026, 5, 15, 10),
      kind: 'focus',
      title: 'Focus',
      taskId: T1,
    });
    const future = await blockRepo.create({
      start: new Date(2026, 5, 15, 11),
      end: new Date(2026, 5, 15, 12),
      kind: 'focus',
      title: 'Focus',
      taskId: T1,
    });
    const fixed = await blockRepo.create({
      start: new Date(2026, 5, 15, 13),
      end: new Date(2026, 5, 15, 14),
      kind: 'fixed',
      title: 'Dentist',
    });
    await commitLayout({
      dayKey: DAY,
      window: WINDOW,
      now: NOW,
      blocks: [{ taskId: T2, start: new Date(2026, 5, 15, 15).getTime(), end: new Date(2026, 5, 15, 15, 30).getTime() }],
    });
    expect(await blockRepo.getById(started.id)).toBeTruthy();
    expect(await blockRepo.getById(future.id)).toBeUndefined();
    expect(await blockRepo.getById(fixed.id)).toBeTruthy();
  });

  it('rolls back blocks and plan together when a write fails', async () => {
    await dayPlanRepo.upsert(DAY, { picks: [T1, T2], capacityMin: 120 });
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
        overflowTaskIds: [T2],
      }),
    ).rejects.toThrow();
    const plan = await dayPlanRepo.getByDate(DAY);
    expect(plan?.picks).toEqual([T1, T2]);
    expect((await blockRepo.getById(existing.id))?.start.getHours()).toBe(11);
    const db = await getDb();
    expect(await db.blocks.count()).toBe(1);
  });
});
