import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { ensureDefaultDomains } from '@/lib/db/init';
import { domainRepo } from '@/lib/db/domain.repo';
import { projectRepo } from '@/lib/db/project.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { blockRepo } from '@/lib/db/block.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { estimateRepo } from '@/lib/db/estimate.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';
import { applyTransition, canTransition, TASK_TRANSITIONS } from '@/lib/tasks/transitions';
import type { Task } from '@/lib/schemas/task';
import { toLocalDateString } from '@/lib/utils/date';

const T0 = new Date('2026-10-01T09:00:00');
const T1 = new Date('2026-10-10T09:00:00');
const T2 = new Date('2026-10-20T09:00:00');

function baseTask(overrides: Partial<Parameters<typeof taskRepo.create>[0]> = {}) {
  return { title: 'Fix the hose', source: 'manual' as const, ...overrides };
}

describe('Wave 1 repositories', () => {
  beforeEach(async () => {
    await resetDbForTesting();
  });

  it('seeds four default domains and supports domain CRUD', async () => {
    const seeded = await domainRepo.getAll();
    expect(seeded.map((d) => d.name)).toEqual(['Trading', 'Practice', 'Career/Build', 'Life admin']);

    const created = await domainRepo.create({ name: 'Learning' });
    expect(created.name).toBe('Learning');
    expect(created.order).toBe(4); // after the seeds

    const updated = await domainRepo.update(created.id, { name: 'Study', color: '#123456' });
    expect(updated.name).toBe('Study');
    expect(updated.color).toBe('#123456');

    await domainRepo.delete(created.id);
    expect(await domainRepo.getAll()).toHaveLength(4);
  });

  it('project queries: by domain, by status, stale-since, touch', async () => {
    const active = await projectRepo.create({
      title: 'Rebuild portfolio',
      domainId: DOMAIN_SEED_IDS.career,
      status: 'active',
    });
    const stale = await projectRepo.create({
      title: 'Old trading plan',
      domainId: DOMAIN_SEED_IDS.trading,
      status: 'active',
    });
    // Age the second project without faking the clock: rewrite its timestamps.
    const db = (await import('@/lib/db/db')).getDb();
    await db.projects.put({ ...stale, lastTouchedAt: T0, createdAt: T0, updatedAt: T0 });

    expect((await projectRepo.byDomain(DOMAIN_SEED_IDS.career)).map((p) => p.id)).toEqual([active.id]);
    expect(await projectRepo.byStatus('active')).toHaveLength(2);
    expect((await projectRepo.staleSince(T1)).map((p) => p.id)).toEqual([stale.id]);
    expect(await projectRepo.staleSince(T1, ['paused'])).toHaveLength(0);

    const touched = await projectRepo.touch(stale.id, T2);
    expect(touched.lastTouchedAt.getTime()).toBe(T2.getTime());
    expect(await projectRepo.staleSince(T1)).toHaveLength(0);
  });

  it('task CRUD + typed queries: by status, domain, project, children, stale-since', async () => {
    const inbox = await taskRepo.create(baseTask());
    expect(inbox.status).toBe('inbox'); // input default

    const next = await taskRepo.create(
      baseTask({ title: 'Call plumber', status: 'next', domainId: DOMAIN_SEED_IDS.lifeAdmin })
    );
    const child = await taskRepo.create(
      baseTask({ title: 'Find plumber number', parentId: next.id, projectId: null })
    );

    expect((await taskRepo.byStatus('inbox')).map((t) => t.id).sort()).toEqual([child.id, inbox.id].sort());
    expect((await taskRepo.byDomain(DOMAIN_SEED_IDS.lifeAdmin)).map((t) => t.id)).toEqual([next.id]);
    expect((await taskRepo.children(next.id)).map((t) => t.id)).toEqual([child.id]);

    // Age the inbox task for stale-since.
    const db = (await import('@/lib/db/db')).getDb();
    await db.tasks.put({ ...inbox, touchedAt: T0, createdAt: T0 });
    expect((await taskRepo.staleSince(T1)).map((t) => t.id)).toEqual([inbox.id]);
    expect((await taskRepo.staleSince(T1, ['next']))).toHaveLength(0);

    const updated = await taskRepo.update(inbox.id, { title: 'Fix the garden hose' });
    expect(updated.title).toBe('Fix the garden hose');
    expect(updated.touchedAt.getTime()).toBeGreaterThan(T0.getTime()); // update bumps touchedAt

    await taskRepo.delete(child.id);
    expect(await taskRepo.children(next.id)).toHaveLength(0);
  });

  it('setStatus walks legal transitions and manages doneAt', async () => {
    const task = await taskRepo.create(baseTask());
    const scheduled = await taskRepo.setStatus(task.id, 'scheduled', T0);
    expect(scheduled.status).toBe('scheduled');
    expect(scheduled.touchedAt.getTime()).toBe(T0.getTime());

    const done = await taskRepo.setStatus(task.id, 'done', T1);
    expect(done.status).toBe('done');
    expect(done.doneAt!.getTime()).toBe(T1.getTime());

    const reopened = await taskRepo.setStatus(task.id, 'inbox', T2);
    expect(reopened.status).toBe('inbox');
    expect(reopened.doneAt).toBeNull();

    // done -> dropped is illegal: verify from an actually-done task.
    const finishable = await taskRepo.create(baseTask({ status: 'next' }));
    await taskRepo.setStatus(finishable.id, 'done');
    await expect(taskRepo.setStatus(finishable.id, 'dropped')).rejects.toThrow(/Illegal task transition/);
  });

  it('blocks: CRUD, overlap range, byKind', async () => {
    const focus = await blockRepo.create({
      start: new Date('2026-10-23T09:00:00'),
      end: new Date('2026-10-23T10:00:00'),
      kind: 'focus',
      title: 'Deep work',
    });
    await blockRepo.create({
      start: new Date('2026-10-23T11:00:00'),
      end: new Date('2026-10-23T12:00:00'),
      kind: 'anchor',
      title: 'Lunch',
    });
    // A block straddling the query boundary must still match.
    await blockRepo.create({
      start: new Date('2026-10-23T08:00:00'),
      end: new Date('2026-10-23T09:30:00'),
      kind: 'fixed',
      title: 'Standup spill',
    });
    // Next day, must not match.
    await blockRepo.create({
      start: new Date('2026-10-24T09:00:00'),
      end: new Date('2026-10-24T10:00:00'),
      kind: 'focus',
      title: 'Tomorrow',
    });

    const day = await blockRepo.range(
      new Date('2026-10-23T09:00:00'),
      new Date('2026-10-23T18:00:00')
    );
    expect(day.map((b) => b.title)).toEqual(['Standup spill', 'Deep work', 'Lunch']);
    expect(await blockRepo.byKind('focus')).toHaveLength(2);

    await expect(
      blockRepo.create({ start: new Date('2026-10-23T10:00:00'), end: new Date('2026-10-23T09:00:00'), kind: 'focus', title: 'Bad' })
    ).rejects.toThrow(); // end > start refine

    await blockRepo.delete(focus.id);
    expect(await blockRepo.getAll()).toHaveLength(3);
  });

  it('day plans: upsert keeps createdAt, keyed by local day, range query', async () => {
    const today = toLocalDateString(new Date());
    const plan = await dayPlanRepo.upsert(today, { picks: [], capacityMin: 120 });
    expect(plan.date).toBe(today);
    const again = await dayPlanRepo.upsert(today, { picks: [], capacityMin: 180, shutdownNote: 'wound down' });
    expect(again.capacityMin).toBe(180);
    expect(again.createdAt.getTime()).toBe(plan.createdAt.getTime()); // upsert preserves it
    expect(await dayPlanRepo.getByDate(today)).toBeDefined();

    const other = toLocalDateString(new Date(Date.now() + 86_400_000));
    await dayPlanRepo.upsert(other, { picks: [], capacityMin: 90 });
    expect(await dayPlanRepo.range('2000-01-01', '2999-12-31')).toHaveLength(2);

    await dayPlanRepo.delete(today);
    expect(await dayPlanRepo.getByDate(today)).toBeUndefined();
  });

  it('estimates: by task ordered by createdAt, multiple sources', async () => {
    const task = await taskRepo.create(baseTask());
    const user = await estimateRepo.create({ taskId: task.id, source: 'user', minutes: 20 });
    const db = (await import('@/lib/db/db')).getDb();
    await db.estimates.put({ ...user, createdAt: T0, updatedAt: T0 });
    await estimateRepo.create({ taskId: task.id, source: 'openai', minutes: 45, rationale: 'model guess' });

    const all = await estimateRepo.byTask(task.id);
    expect(all.map((e) => e.source)).toEqual(['user', 'openai']); // creation order

    await estimateRepo.delete(user.id);
    expect(await estimateRepo.byTask(task.id)).toHaveLength(1);
  });

  it('sessions accept optional task/project/block links and query by them', async () => {
    const task = await taskRepo.create(baseTask({ status: 'next' }));
    const block = await blockRepo.create({
      start: new Date('2026-10-23T09:00:00'),
      end: new Date('2026-10-23T09:30:00'),
      kind: 'focus',
      title: 'Hose fix',
      taskId: task.id,
    });
    const session = await sessionRepo.save({
      startedAt: new Date('2026-10-23T09:00:00'),
      durationMinutes: 25,
      reps: null,
      rating: 4,
      taskId: task.id,
      projectId: null,
      blockId: block.id,
    });
    expect(session.taskId).toBe(task.id);
    expect(session.blockId).toBe(block.id);

    const db = (await import('@/lib/db/db')).getDb();
    expect(await db.sessions.where('taskId').equals(task.id).count()).toBe(1);
  });
  it('ensureDefaultDomains heals an empty domains table on an existing v7 database', async () => {
    // Simulate a fresh-install seed that silently failed: the database
    // exists at v7 (populate will never fire again) with no domain rows.
    getDb().close();
    await Dexie.delete('chrono-kata');
    const raw = new Dexie('chrono-kata');
    raw.version(7).stores({
      domains: 'id, order',
      projects: 'id, domainId, status, lastTouchedAt',
      tasks: 'id, status, domainId, projectId, parentId, touchedAt',
      blocks: 'id, start, kind, taskId, projectId',
      dayPlans: 'date',
      estimates: 'id, taskId, createdAt',
    });
    await raw.open();
    expect(await raw.table('domains').count()).toBe(0); // populate did not seed
    raw.close();

    await ensureDefaultDomains();
    const db = getDb();
    expect(await db.domains.count()).toBe(4);
    expect((await db.domains.toArray()).map((d) => d.name)).toContain('Practice');

    // Idempotent: a second call is a no-op.
    await ensureDefaultDomains();
    expect(await db.domains.count()).toBe(4);
  });
});

describe('task transitions (pure)', () => {
  const task = (status: Task['status']): Task => ({
    id: '00000000-0000-4000-8000-0000000000aa',
    title: 't',
    status,
    source: 'manual',
    createdAt: T0,
    touchedAt: T0,
  });

  it('every status has a legal move except self (no-op allowed at apply)', () => {
    for (const from of Object.keys(TASK_TRANSITIONS) as Task['status'][]) {
      expect(TASK_TRANSITIONS[from].length).toBeGreaterThan(0);
      expect(TASK_TRANSITIONS[from]).not.toContain(from);
    }
    expect(canTransition('inbox', 'next')).toBe(true);
    expect(canTransition('waiting', 'scheduled')).toBe(false);
    expect(canTransition('done', 'dropped')).toBe(false);
  });

  it('applyTransition sets doneAt exactly on done and bumps touchedAt', () => {
    const done = applyTransition(task('next'), 'done', T1);
    expect(done.doneAt).toBe(T1);
    expect(done.touchedAt).toBe(T1);

    const reopened = applyTransition(done, 'inbox', T2);
    expect(reopened.doneAt).toBeNull();

    const noop = applyTransition(task('next'), 'next', T1);
    expect(noop.status).toBe('next');
    expect(noop.touchedAt).toBe(T1);

    expect(() => applyTransition(task('done'), 'dropped')).toThrow(/Illegal/);
  });
});
