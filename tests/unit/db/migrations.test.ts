import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { checkInRepo } from '@/lib/db/check-in.repo';

/**
 * Migration harness: create the database at an old version with raw Dexie,
 * seed fixture rows, close it, then open the current `ChronoKataDB` and assert
 * the rows survive and the new tables exist.
 *
 * The store definitions below are a frozen snapshot of what shipped at each
 * version. Don't edit them to match `db.ts`; add the next version instead.
 * T8 adds v5 → v6 here.
 */
const HISTORICAL_STORES: Record<number, Record<string, string>> = {
  1: {
    sessions: 'id, startedAt, calendarEventId',
    reflections: 'id, periodStart, periodEnd',
    streak: 'id',
    settings: 'id',
    llmSettings: 'id',
    pendingCalendarOps: 'id, sessionId',
    tokens: 'id',
  },
  2: {
    sessions: 'id, startedAt, calendarEventId, conversationId',
    conversations: 'id, sessionId',
    messages: 'id, conversationId, parentId',
  },
  3: {
    kataTemplates: 'id, name, order, createdAt',
  },
  4: {
    habits: 'id, order',
    habitLogs: 'id, habitId, date, sessionId, [habitId+date]',
  },
};

type Fixtures = Record<string, unknown[]>;

/** Create `chrono-kata` at `version` (applying every earlier version) and seed rows. */
async function seedLegacyDb(version: number, fixtures: Fixtures): Promise<void> {
  const legacy = new Dexie('chrono-kata');
  for (let v = 1; v <= version; v++) {
    const stores = HISTORICAL_STORES[v];
    if (!stores) throw new Error(`No historical store snapshot for v${v}`);
    legacy.version(v).stores(stores);
  }
  await legacy.open();
  for (const [table, rows] of Object.entries(fixtures)) {
    await legacy.table(table).bulkAdd(rows);
  }
  legacy.close();
}

const T = new Date('2026-09-20T08:00:00Z');

const V4_FIXTURES: Fixtures = {
  sessions: [
    {
      id: '123e4567-e89b-12d3-a456-426614174001',
      startedAt: T,
      endedAt: null,
      durationMinutes: 20,
      reps: null,
      rating: 4,
      activityLabel: 'Walk',
      createdAt: T,
      updatedAt: T,
    },
  ],
  kataTemplates: [
    {
      id: '123e4567-e89b-12d3-a456-426614174002',
      name: 'Walk',
      mode: 'timed',
      defaultDurationMinutes: 20,
      defaultReps: null,
      icon: '🚶',
      order: 0,
      createdAt: T,
      updatedAt: T,
    },
  ],
  habits: [
    {
      id: '123e4567-e89b-12d3-a456-426614174003',
      name: 'Walk',
      icon: '🚶',
      kind: 'timed',
      targetPerDay: 20,
      schedule: { kind: 'daily' },
      linkedActivityLabel: 'Walk',
      order: 0,
      archivedAt: null,
      createdAt: T,
      updatedAt: T,
    },
  ],
  habitLogs: [
    {
      id: '123e4567-e89b-12d3-a456-426614174004',
      habitId: '123e4567-e89b-12d3-a456-426614174003',
      date: '2026-09-20',
      minutes: 20,
      source: 'session',
      sessionId: '123e4567-e89b-12d3-a456-426614174001',
      createdAt: T,
    },
  ],
  settings: [{ id: 'singleton', displayName: 'Tester', createdAt: T, updatedAt: T }],
};

describe('Dexie migrations', () => {
  beforeEach(async () => {
    getDb().close();
    await Dexie.delete('chrono-kata');
  });

  it('v4 → v5 keeps existing rows and adds an empty checkIns table', async () => {
    await seedLegacyDb(4, V4_FIXTURES);

    const db = getDb();
    await db.open();
    expect(db.verno).toBe(5);

    for (const [table, rows] of Object.entries(V4_FIXTURES)) {
      expect(await db.table(table).toArray(), table).toEqual(rows);
    }
    // Compound index from v4 still works after the upgrade.
    expect(
      await db.habitLogs.where('[habitId+date]').equals(['123e4567-e89b-12d3-a456-426614174003', '2026-09-20']).count()
    ).toBe(1);

    expect(await db.checkIns.count()).toBe(0);
    await checkInRepo.upsert({ date: '2026-09-21', energy: 2, fog: 3, aches: 2, sleep: 3 });
    expect((await checkInRepo.getByDate('2026-09-21'))?.energy).toBe(2);
  });

  it('opens a fresh database at the current version', async () => {
    const db = await resetDbForTesting();
    await db.open();
    expect(db.verno).toBe(5);
    expect(db.tables.map((t) => t.name)).toContain('checkIns');
  });
});
