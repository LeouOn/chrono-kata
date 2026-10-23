import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { checkInRepo } from '@/lib/db/check-in.repo';
import { generateDemoData } from '@/lib/pacing/seed-data';
import { DEFAULT_DOMAINS, DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';
import { DEXIE_V6_FIXTURES } from '../../fixtures/dexie-v6';

/**
 * Migration harness: create the database at an old version with raw Dexie,
 * seed fixture rows, close it, then open the current `ChronoKataDB` and assert
 * the rows survive and the new tables exist.
 *
 * The store definitions below are a frozen snapshot of what shipped at each
 * version. Don't edit them to match `db.ts`; add the next version instead.
 * T8 adds v5 → v6 here; the v6 dump in `tests/fixtures/dexie-v6.ts` covers
 * that shape. Wave 1 adds v6 → v7.
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
  5: {
    checkIns: 'date',
  },
  6: {
    sessions: 'id, startedAt, calendarEventId, conversationId, kataTemplateId',
  },
  7: {
    sessions: 'id, startedAt, calendarEventId, conversationId, kataTemplateId, taskId, projectId',
    domains: 'id, order',
    projects: 'id, domainId, status, lastTouchedAt',
    tasks: 'id, status, domainId, projectId, parentId, touchedAt',
    blocks: 'id, start, kind, taskId, projectId',
    dayPlans: 'date',
    estimates: 'id, taskId, createdAt',
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
    expect(db.verno).toBe(7);

    const walkId = '123e4567-e89b-12d3-a456-426614174002';
    const session = await db.sessions.get('123e4567-e89b-12d3-a456-426614174001');
    const habit = await db.habits.get('123e4567-e89b-12d3-a456-426614174003');
    expect(session?.activityLabel).toBe('Walk');
    expect(session?.kataTemplateId).toBe(walkId);
    expect(habit?.linkedKataTemplateId).toBe(walkId);
    expect(await db.habitLogs.count()).toBe(1);
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
    expect(db.verno).toBe(7);
    expect(db.tables.map((t) => t.name)).toContain('checkIns');
    expect(db.tables.map((t) => t.name)).toContain('tasks');
  });

  it('v5 → v6 links mixed-case labels and leaves unmatched rows alone', async () => {
    const templateId = '123e4567-e89b-12d3-a456-426614174010';
    const otherId = '123e4567-e89b-12d3-a456-426614174011';
    await seedLegacyDb(5, {
      ...V4_FIXTURES,
      kataTemplates: [
        {
          id: templateId,
          name: 'Morning Walk',
          mode: 'timed',
          defaultDurationMinutes: 20,
          defaultReps: null,
          icon: '🚶',
          order: 0,
          createdAt: T,
          updatedAt: T,
        },
        {
          id: otherId,
          name: '  deep   work ',
          mode: 'timed',
          defaultDurationMinutes: 45,
          defaultReps: null,
          icon: '⚡',
          order: 1,
          createdAt: T,
          updatedAt: T,
        },
      ],
      sessions: [
        {
          id: '123e4567-e89b-12d3-a456-426614174012',
          startedAt: T,
          durationMinutes: 20,
          reps: null,
          rating: 4,
          activityLabel: 'morning   walk',
          createdAt: T,
          updatedAt: T,
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174013',
          startedAt: T,
          durationMinutes: 10,
          reps: null,
          rating: 3,
          activityLabel: 'Walking',
          createdAt: T,
          updatedAt: T,
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174014',
          startedAt: T,
          durationMinutes: 45,
          reps: null,
          rating: 5,
          activityLabel: 'Deep Work',
          createdAt: T,
          updatedAt: T,
        },
      ],
      habits: [
        {
          id: '123e4567-e89b-12d3-a456-426614174015',
          name: 'Steps',
          icon: '🚶',
          kind: 'timed',
          targetPerDay: 20,
          schedule: { kind: 'daily' },
          linkedActivityLabel: 'MORNING WALK',
          order: 0,
          archivedAt: null,
          createdAt: T,
          updatedAt: T,
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174016',
          name: 'Yoga',
          icon: '🧘',
          kind: 'boolean',
          targetPerDay: null,
          schedule: { kind: 'daily' },
          linkedActivityLabel: 'yoga',
          order: 1,
          archivedAt: null,
          createdAt: T,
          updatedAt: T,
        },
      ],
    });

    const db = getDb();
    await db.open();
    expect((await db.sessions.get('123e4567-e89b-12d3-a456-426614174012'))?.kataTemplateId).toBe(templateId);
    expect((await db.sessions.get('123e4567-e89b-12d3-a456-426614174013'))?.kataTemplateId).toBeUndefined();
    expect((await db.sessions.get('123e4567-e89b-12d3-a456-426614174014'))?.kataTemplateId).toBe(otherId);
    expect((await db.habits.get('123e4567-e89b-12d3-a456-426614174015'))?.linkedKataTemplateId).toBe(templateId);
    expect((await db.habits.get('123e4567-e89b-12d3-a456-426614174016'))?.linkedKataTemplateId).toBeUndefined();
  });

  it('opens the synthetic v6 dump with every row intact', async () => {
    await seedLegacyDb(6, DEXIE_V6_FIXTURES);

    const db = getDb();
    await db.open();
    // Opened at the current version; v7 adds tables and seeds domains, but
    // every v6 row below must survive unchanged.
    expect(db.verno).toBe(7);

    for (const [table, rows] of Object.entries(DEXIE_V6_FIXTURES)) {
      expect(await db.table(table).count(), table).toBe(rows.length);
    }

    // Indexes that later waves may rely on still resolve on the fixture data.
    expect(await db.sessions.where('kataTemplateId').equals('b7a04fe2-0b66-4d86-b40c-afa2b45af613').count()).toBe(1);
    expect(await db.habitLogs.where('habitId').equals('c0dca0e9-d048-4f8e-92b5-116ec0d64eac').count()).toBe(2);
    expect(await db.messages.where('parentId').equals('06d2d4b4-55f1-4a9b-b694-d71aa78315a3').count()).toBe(2);
    expect(await checkInRepo.getByDate('2026-10-20')).toMatchObject({ energy: 4, fog: 1 });
    expect(await db.domains.count()).toBe(4);
  });

  it('v6 → v7 preserves every v6 row and seeds the default domains', async () => {
    // Real v6 data: the pacing demo dataset (templates, sessions with
    // kataTemplateId links, check-ins) plus habit/settings rows.
    const demo = generateDemoData('2026-09-28');
    await seedLegacyDb(6, {
      kataTemplates: demo.templates,
      sessions: demo.sessions,
      checkIns: demo.checkIns,
      habits: V4_FIXTURES.habits!,
      habitLogs: V4_FIXTURES.habitLogs!,
      settings: V4_FIXTURES.settings!,
    });

    const db = getDb();
    await db.open();
    expect(db.verno).toBe(7);

    // Every existing row survives, counts intact.
    expect(await db.kataTemplates.count()).toBe(demo.templates.length);
    expect(await db.sessions.count()).toBe(demo.sessions.length);
    expect(await db.checkIns.count()).toBe(demo.checkIns.length);
    expect(await db.habits.count()).toBe(1);
    expect(await db.habitLogs.count()).toBe(1);
    expect((await db.settings.get('singleton'))?.displayName).toBe('Tester');

    // Spot-check integrity: v6 backfilled links and data values survive.
    const linked = demo.sessions.filter((s) => s.kataTemplateId);
    expect(linked.length).toBeGreaterThan(0);
    for (const session of linked) {
      expect((await db.sessions.get(session.id))?.kataTemplateId).toBe(session.kataTemplateId);
    }
    const firstCheckIn = demo.checkIns[0]!;
    expect((await db.checkIns.get(firstCheckIn.date))?.energy).toBe(firstCheckIn.energy);
    // The v4 compound index still works after two more upgrades.
    expect(
      await db.habitLogs
        .where('[habitId+date]')
        .equals(['123e4567-e89b-12d3-a456-426614174003', '2026-09-20'])
        .count()
    ).toBe(1);

    // New tables exist, empty except the seeded domains.
    expect(await db.projects.count()).toBe(0);
    expect(await db.tasks.count()).toBe(0);
    expect(await db.blocks.count()).toBe(0);
    expect(await db.dayPlans.count()).toBe(0);
    expect(await db.estimates.count()).toBe(0);
    const domains = await db.domains.toArray();
    expect(domains.map((d) => d.id)).toEqual(DEFAULT_DOMAINS.map((d) => d.id));
    expect(domains.map((d) => d.name)).toEqual(['Trading', 'Practice', 'Career/Build', 'Life admin']);
    // Sessions keep working without task/project links; the new indexes
    // are ready for them.
    expect(await db.sessions.where('taskId').equals('00000000-0000-4000-8000-000000000099').count()).toBe(0);
    expect(DOMAIN_SEED_IDS.practice).toBe('11111111-1111-4111-8111-111111111112');
  });

  it('seeds the default domains on a fresh install (populate path)', async () => {
    const db = await resetDbForTesting();
    await db.open();
    expect(db.verno).toBe(7);
    const domains = await db.domains.orderBy('order').toArray();
    expect(domains).toHaveLength(4);
    expect(domains.map((d) => d.name)).toEqual(['Trading', 'Practice', 'Career/Build', 'Life admin']);
    expect(domains.map((d) => d.id)).toEqual(DEFAULT_DOMAINS.map((d) => d.id));
    // Seeding is idempotent: a second seed attempt adds nothing.
    await db.domains.bulkPut(DEFAULT_DOMAINS);
    expect(await db.domains.count()).toBe(4);
  });
});
