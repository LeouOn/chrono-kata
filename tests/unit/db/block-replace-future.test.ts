import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTesting } from '@/lib/db/db';
import { blockRepo } from '@/lib/db/block.repo';

const START = new Date(2026, 5, 15, 9, 0);
const END = new Date(2026, 5, 15, 17, 0);
const WINDOW = { start: START, end: END };
const TASK_A = '11111111-1111-4111-8111-111111111111';
const TASK_B = '22222222-2222-4222-8222-222222222222';

async function focus(startHour: number, endHour: number, taskId = TASK_A, title = 'Focus') {
  return blockRepo.create({
    start: new Date(2026, 5, 15, startHour, 0),
    end: new Date(2026, 5, 15, endHour, 0),
    kind: 'focus',
    title,
    taskId,
  });
}

beforeEach(async () => {
  await resetDbForTesting();
});

describe('blockRepo.replaceFutureFocus', () => {
  it('writes exactly the proposed focus blocks with the right task and times', async () => {
    await blockRepo.replaceFutureFocus(WINDOW, new Date(2026, 5, 15, 8, 0), [
      { taskId: TASK_A, start: new Date(2026, 5, 15, 9, 0).getTime(), end: new Date(2026, 5, 15, 9, 30).getTime() },
      { taskId: TASK_B, start: new Date(2026, 5, 15, 10, 0).getTime(), end: new Date(2026, 5, 15, 10, 45).getTime() },
    ]);
    const blocks = await blockRepo.range(START, END);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.kind === 'focus')).toBe(true);
    expect(blocks.map((block) => [block.taskId, block.start.getHours(), block.end.getMinutes()])).toEqual([
      [TASK_A, 9, 30],
      [TASK_B, 10, 45],
    ]);
  });

  it('keeps a focus block whose start is at or before now and replaces only future ones', async () => {
    const started = await focus(9, 10);
    const future = await focus(11, 12, TASK_B);
    await blockRepo.replaceFutureFocus(WINDOW, new Date(2026, 5, 15, 10, 0), [
      { taskId: TASK_A, start: new Date(2026, 5, 15, 14, 0).getTime(), end: new Date(2026, 5, 15, 15, 0).getTime() },
    ]);
    const blocks = await blockRepo.range(START, END);
    expect(blocks.map((block) => block.id)).toContain(started.id);
    expect(blocks.map((block) => block.id)).not.toContain(future.id);
    expect(blocks).toHaveLength(2);
    expect(blocks.some((block) => block.start.getHours() === 14 && block.taskId === TASK_A)).toBe(true);
  });

  it('leaves fixed blocks and focus blocks outside the window alone', async () => {
    const fixed = await blockRepo.create({
      start: new Date(2026, 5, 15, 9, 0),
      end: new Date(2026, 5, 15, 10, 0),
      kind: 'fixed',
      title: 'Dentist',
    });
    const elsewhere = await blockRepo.range(new Date(2026, 5, 14), new Date(2026, 5, 16));
    expect(elsewhere.length).toBe(1);
    await blockRepo.replaceFutureFocus(WINDOW, new Date(2026, 5, 15, 8, 0), [
      { taskId: TASK_A, start: new Date(2026, 5, 15, 11, 0).getTime(), end: new Date(2026, 5, 15, 12, 0).getTime() },
    ]);
    expect((await blockRepo.getById(fixed.id))?.kind).toBe('fixed');
  });

  it('rolls back atomically when one block is invalid', async () => {
    const old = await focus(9, 10);
    await expect(
      blockRepo.replaceFutureFocus(WINDOW, new Date(2026, 5, 15, 8, 0), [
        { taskId: TASK_A, start: new Date(2026, 5, 15, 11, 0).getTime(), end: new Date(2026, 5, 15, 12, 0).getTime() },
        { taskId: TASK_B, start: new Date(2026, 5, 15, 13, 0).getTime(), end: new Date(2026, 5, 15, 12, 0).getTime() },
      ]),
    ).rejects.toThrow();
    const blocks = await blockRepo.range(START, END);
    expect(blocks.map((block) => block.id)).toEqual([old.id]);
  });
});
