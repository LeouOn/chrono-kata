import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blockRepo } from '@/lib/db/block.repo';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import type { Block } from '@/lib/schemas/block';
import { BlockSchema } from '@/lib/schemas/block';

const T0 = new Date('2026-03-02T09:00:00Z');

function icsBlock(id: string, calendarRef: string, title = 'Calendar block'): Block {
  return BlockSchema.parse({
    id,
    start: T0,
    end: new Date(T0.getTime() + 30 * 60 * 1000),
    kind: 'fixed',
    title,
    taskId: null,
    projectId: null,
    calendarRef,
    createdAt: T0,
    updatedAt: T0,
  });
}

describe('blockRepo.applyCalendarImport', () => {
  beforeEach(async () => {
    await resetDbForTesting();
  });

  afterEach(async () => {
    await resetDbForTesting();
  });

  it('writes every block in one go', async () => {
    await blockRepo.applyCalendarImport([icsBlock('11111111-1111-4111-8111-111111111111', 'a@cal')]);
    const all = await blockRepo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.calendarRef).toBe('a@cal');
  });

  it('rolls the whole import back when one block is invalid', async () => {
    const good = icsBlock('11111111-1111-4111-8111-111111111111', 'a@cal');
    // end <= start fails BlockSchema's refine — the second write throws.
    const bad = { ...icsBlock('22222222-2222-4222-8222-222222222222', 'b@cal'), end: T0 };
    await expect(blockRepo.applyCalendarImport([good, bad as Block])).rejects.toThrow();
    // Nothing persisted: not the good block, not the bad one.
    expect(await blockRepo.getAll()).toHaveLength(0);
    expect(await getDb().blocks.count()).toBe(0);
  });

  it('updating an existing calendar block keeps its id (no duplicate)', async () => {
    const first = icsBlock('11111111-1111-4111-8111-111111111111', 'a@cal', 'First title');
    await blockRepo.applyCalendarImport([first]);
    const moved = { ...first, title: 'Moved', start: new Date(T0.getTime() + 3600 * 1000), end: new Date(T0.getTime() + 4200 * 1000) };
    await blockRepo.applyCalendarImport([moved]);
    const all = await blockRepo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe('Moved');
  });
});
