import { describe, it, expect, beforeEach } from 'vitest';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { collectIntegritySnapshot, detectIntegrity } from '@/lib/integrity/detect';

/**
 * The IO shell: rows written through the REAL repositories must come back
 * through collectIntegritySnapshot and detect cleanly (the pure core has its
 * own oracle; this proves the snapshot collection against the live Dexie).
 */
describe('collectIntegritySnapshot (real repositories)', () => {
  beforeEach(async () => {
    await resetDbForTesting();
  });

  it('collects every table the detector looks at, and a clean DB is clean', async () => {
    await settingsRepo.get(); // creates the singleton row, as the app does
    const task = await taskRepo.create({ title: 'real task' });
    await dayPlanRepo.upsert('2026-10-24', {
      picks: [task.id],
      capacityMin: 120,
      picksDone: [task.id],
    });

    const snapshot = await collectIntegritySnapshot(getDb());
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.dayPlans).toHaveLength(1);
    expect(snapshot.domains.length).toBe(4); // default seed
    expect(snapshot.settings).not.toBeNull();
    expect(detectIntegrity(snapshot)).toEqual([]);
  });

  it('sees a bad row written behind the repositories (raw Dexie put)', async () => {
    await getDb().tasks.put({
      id: '00000000-0000-4000-8000-00000000bad',
      title: 'raw row',
      status: 'inbox',
      source: 'manual',
      // The kind of impossible value a bad write once shipped.
      createdAt: new Date(Date.now() + 48 * 3_600_000),
      touchedAt: new Date(),
    });
    const snapshot = await collectIntegritySnapshot(getDb());
    const kinds = detectIntegrity(snapshot).map((i) => i.kind);
    expect(kinds).toContain('row-date-in-future');
  });
});
