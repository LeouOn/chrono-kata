import { describe, it, expect, beforeEach } from 'vitest';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { blockRepo } from '@/lib/db/block.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { collectIntegritySnapshot, detectIntegrity } from '@/lib/integrity/detect';

const DAY = 24 * 3_600_000;
const kinds = async () => detectIntegrity(await collectIntegritySnapshot(getDb())).map((i) => `${i.kind}:${'field' in i ? (i as { field: string }).field : ''}`);

describe('lead probe: ordinary use must be clean', () => {
  beforeEach(async () => { await resetDbForTesting(); await settingsRepo.get(); });

  it('P1 planned future dates (due in 30d, deferred a week, block in 3 days) are not corruption', async () => {
    await taskRepo.create({ title: 'due later', dueAt: new Date(Date.now() + 30 * DAY), deferUntil: new Date(Date.now() + 7 * DAY) });
    await blockRepo.create({ start: new Date(Date.now() + 3 * DAY), end: new Date(Date.now() + 3 * DAY + 3_600_000), kind: 'fixed', title: 'dentist' });
    expect(await kinds()).toEqual([]);
  });

  it('P2 a recurring calendar event: occurrence blocks share ONE calendarRef by design', async () => {
    for (let i = 0; i < 3; i++) {
      await blockRepo.create({ start: new Date(Date.now() + i * 7 * DAY), end: new Date(Date.now() + i * 7 * DAY + 3_600_000), kind: 'fixed', title: 'standup', calendarRef: 'uid-weekly@example.com' });
    }
    expect(await kinds()).toEqual([]);
  });

  it('P3 a zero-length reps session (schema allows it) is not corruption', async () => {
    const t = new Date();
    await sessionRepo.save({ startedAt: t, endedAt: t, reps: 5, rating: 3 } as never);
    expect(await kinds()).toEqual([]);
  });

  it('P4 deleting a task through the repo (the only delete path) leaves what the detector calls?', async () => {
    const task = await taskRepo.create({ title: 'to delete' });
    await sessionRepo.save({ startedAt: new Date(Date.now() - 600_000), endedAt: new Date(), durationMinutes: 10, rating: 3, taskId: task.id } as never);
    await taskRepo.delete(task.id);
    console.log('P4 after ordinary delete:', await kinds());
  });
});

describe('lead probe: hostile rows must not crash the detector', () => {
  beforeEach(async () => { await resetDbForTesting(); await settingsRepo.get(); });

  it('P5 non-Date values written behind the repositories', async () => {
    const db = getDb();
    await db.blocks.put({ id: '00000000-0000-4000-8000-0000000000b1', start: 'not a date', end: 12345, kind: 'fixed', title: 'raw', createdAt: new Date(), updatedAt: new Date() } as never);
    await db.sessions.put({ id: '00000000-0000-4000-8000-0000000000a1', startedAt: 'garbage', endedAt: 'garbage', reps: 1, rating: 3, createdAt: new Date(), updatedAt: new Date(), conversationId: '00000000-0000-4000-8000-0000000000c1' } as never);
    const snap = await collectIntegritySnapshot(db);
    let threw: unknown = null;
    try { detectIntegrity(snap); } catch (e) { threw = e; }
    expect(threw).toBeNull();
  });

  it('P6 an Invalid Date (what a bad parse leaves) is reported, not silently clean', async () => {
    const db = getDb();
    await db.tasks.put({ id: '00000000-0000-4000-8000-0000000000d1', title: 'bad date', status: 'done', source: 'manual', createdAt: new Date('nope'), touchedAt: new Date(), doneAt: new Date('nope') } as never);
    const out = detectIntegrity(await collectIntegritySnapshot(db));
    console.log('P6 invalid-date task ->', out.map((i) => i.kind));
    expect(out.length).toBeGreaterThan(0);
  });
});
