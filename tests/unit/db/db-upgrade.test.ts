import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { sessionRepo } from '@/lib/db/session.repo';
import { habitRepo } from '@/lib/db/habit.repo';

/**
 * Regression: upgrading an existing version-3 database (pre-habits) to
 * version 4 must preserve all existing records and add the new tables.
 */
describe('Dexie upgrade v3 -> v4', () => {
  beforeEach(async () => {
    if (getDb()) {
      getDb().close();
    }
    await Dexie.delete('chrono-kata');
  });

  it('preserves v3 data and exposes the habits tables', async () => {
    const legacy = new Dexie('chrono-kata');
    legacy.version(1).stores({
      sessions: 'id, startedAt, calendarEventId',
      reflections: 'id, periodStart, periodEnd',
      streak: 'id',
      settings: 'id',
      llmSettings: 'id',
      pendingCalendarOps: 'id, sessionId',
      tokens: 'id',
    });
    legacy.version(2).stores({
      sessions: 'id, startedAt, calendarEventId, conversationId',
      conversations: 'id, sessionId',
      messages: 'id, conversationId, parentId',
    });
    legacy.version(3).stores({
      kataTemplates: 'id, name, order, createdAt',
    });

    await legacy.open();
    await legacy.table('sessions').add({
      id: '123e4567-e89b-12d3-a456-42661417400e',
      startedAt: new Date('2026-09-01T10:00:00Z'),
      durationMinutes: 20,
      reps: null,
      rating: 4,
      activityLabel: 'Meditation',
      createdAt: new Date('2026-09-01T10:00:00Z'),
      updatedAt: new Date('2026-09-01T10:00:00Z'),
    });
    await legacy.table('kataTemplates').add({
      id: '123e4567-e89b-12d3-a456-42661417400f',
      name: 'Morning Zazen',
      mode: 'timed',
      defaultDurationMinutes: 20,
      defaultReps: null,
      activityLabel: 'Meditation',
      icon: '🧘',
      order: 0,
      createdAt: new Date('2026-09-01T10:00:00Z'),
      updatedAt: new Date('2026-09-01T10:00:00Z'),
    });
    legacy.close();

    const db = getDb();
    await db.open();

    const sessions = await sessionRepo.getAll();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.activityLabel).toBe('Meditation');

    const habits = await habitRepo.getAll();
    expect(habits).toHaveLength(0);

    const created = await habitRepo.create({
      name: 'Water plants',
      kind: 'boolean',
      targetPerDay: null,
      schedule: { kind: 'daily' },
    });
    expect(await habitRepo.getAll()).toHaveLength(1);
    expect(created.name).toBe('Water plants');
  });
});
