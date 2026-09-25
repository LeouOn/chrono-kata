import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkInRepo } from '@/lib/db/check-in.repo';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import type { CheckInInput } from '@/lib/schemas/check-in';

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => {
  vi.useRealTimers();
});

function input(date: string, overrides: Partial<CheckInInput> = {}): CheckInInput {
  return { date, energy: 3, fog: 2, aches: 2, sleep: 4, ...overrides };
}

describe('checkInRepo', () => {
  it('returns undefined for a day without a check-in', async () => {
    expect(await checkInRepo.getByDate('2026-09-25')).toBeUndefined();
  });

  it('upsert is idempotent per date and keeps createdAt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T07:00:00'));
    const first = await checkInRepo.upsert(input('2026-09-25', { energy: 2 }));

    vi.setSystemTime(new Date('2026-09-25T09:30:00'));
    const second = await checkInRepo.upsert(input('2026-09-25', { energy: 4, note: 'Better after tea' }));

    expect(await getDb().checkIns.count()).toBe(1);
    expect(second.createdAt).toEqual(first.createdAt);
    expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());

    const stored = await checkInRepo.getByDate('2026-09-25');
    expect(stored?.energy).toBe(4);
    expect(stored?.note).toBe('Better after tea');
  });

  it('repeating the same upsert leaves one identical row', async () => {
    await checkInRepo.upsert(input('2026-09-25'));
    await checkInRepo.upsert(input('2026-09-25'));
    const all = await checkInRepo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject(input('2026-09-25'));
  });

  it('rejects out-of-range scores and malformed dates', async () => {
    await expect(checkInRepo.upsert({ ...input('2026-09-25'), energy: 6 as never })).rejects.toThrow();
    await expect(checkInRepo.upsert({ ...input('2026-09-25'), fog: 0 as never })).rejects.toThrow();
    await expect(checkInRepo.upsert({ ...input('2026-09-25'), sleep: 2.5 as never })).rejects.toThrow();
    await expect(checkInRepo.upsert(input('25/09/2026'))).rejects.toThrow();
    await expect(checkInRepo.upsert(input('2026-09-25', { note: 'x'.repeat(501) }))).rejects.toThrow();
    expect(await getDb().checkIns.count()).toBe(0);
  });

  it('range includes both ends and sorts ascending', async () => {
    for (const date of ['2026-09-24', '2026-09-20', '2026-09-22', '2026-09-19', '2026-09-25']) {
      await checkInRepo.upsert(input(date));
    }
    const rows = await checkInRepo.range('2026-09-20', '2026-09-24');
    expect(rows.map((c) => c.date)).toEqual(['2026-09-20', '2026-09-22', '2026-09-24']);
  });

  it('range with a single day and with reversed bounds', async () => {
    await checkInRepo.upsert(input('2026-09-22'));
    expect((await checkInRepo.range('2026-09-22', '2026-09-22')).map((c) => c.date)).toEqual(['2026-09-22']);
    expect(await checkInRepo.range('2026-09-24', '2026-09-20')).toEqual([]);
  });

  it('range crosses month and year boundaries', async () => {
    for (const date of ['2025-12-31', '2026-01-01', '2026-02-01']) {
      await checkInRepo.upsert(input(date));
    }
    const rows = await checkInRepo.range('2025-12-31', '2026-01-31');
    expect(rows.map((c) => c.date)).toEqual(['2025-12-31', '2026-01-01']);
  });

  it('getAll is sorted by date and delete removes a single day', async () => {
    await checkInRepo.upsert(input('2026-09-23'));
    await checkInRepo.upsert(input('2026-09-21'));
    await checkInRepo.delete('2026-09-23');
    expect((await checkInRepo.getAll()).map((c) => c.date)).toEqual(['2026-09-21']);
  });
});
