import { describe, it, expect, beforeEach } from 'vitest';
import { collectAll } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { projectRepo } from '@/lib/db/project.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { blockRepo } from '@/lib/db/block.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { estimateRepo } from '@/lib/db/estimate.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';
import { toLocalDateString } from '@/lib/utils/date';

/**
 * Wave 1 backup round-trip: the six new tables plus a linked session must
 * survive export -> JSON string -> parse -> replaceAll into a fresh database.
 */
describe('Wave 1 backup round-trip', () => {
  beforeEach(async () => {
    await resetDbForTesting();

    const project = await projectRepo.create({
      title: 'Rebuild portfolio',
      domainId: DOMAIN_SEED_IDS.career,
      status: 'active',
      cadencePerWeek: 2,
      cadenceBlockMin: 45,
      stallAfterDays: 10,
      breadcrumb: 'after this: pick 3 projects',
    });
    const task = await taskRepo.create({
      title: 'Fix the hose',
      nextAction: 'find the wrench',
      status: 'next',
      domainId: DOMAIN_SEED_IDS.lifeAdmin,
      projectId: project.id,
      estimateMin: 20,
      energy: 'low',
      context: ['hardware-store'],
      source: 'manual',
    });
    const sub = await taskRepo.create({
      title: 'Buy washer',
      parentId: task.id,
      projectId: project.id,
      status: 'inbox',
      source: 'import',
    });
    await blockRepo.create({
      start: new Date('2026-10-23T09:00:00'),
      end: new Date('2026-10-23T09:30:00'),
      kind: 'focus',
      title: 'Hose fix',
      taskId: task.id,
      projectId: project.id,
    });
    await dayPlanRepo.upsert('2026-10-23', {
      picks: [task.id, sub.id],
      capacityMin: 180,
      shutdownNote: 'good day',
    });
    await estimateRepo.create({ taskId: task.id, source: 'user', minutes: 20 });
    await estimateRepo.create({ taskId: task.id, source: 'openai', minutes: 45, rationale: 'guess' });
    // Pin the user estimate earlier so the byTask ordering is deterministic
    // (same-millisecond ties would break on random primary-key order).
    const db = getDb();
    const earlier = (await db.estimates.toArray()).find((e) => e.source === 'user')!;
    const t0 = new Date('2026-10-01T00:00:00Z');
    await db.estimates.put({ ...earlier, createdAt: t0, updatedAt: t0 });
    await sessionRepo.save({
      startedAt: new Date('2026-10-23T09:00:00'),
      durationMinutes: 25,
      reps: null,
      rating: 4,
      taskId: task.id,
      projectId: project.id,
    });
  });

  it('round-trips every Wave 1 table through JSON', async () => {
    const before = await collectAll();
    expect(before.version).toBe(2); // envelope version unchanged; new tables are optional fields
    expect(before.domains).toHaveLength(4); // default seed included
    expect(before.projects).toHaveLength(1);
    expect(before.tasks).toHaveLength(2);
    expect(before.blocks).toHaveLength(1);
    expect(before.dayPlans).toHaveLength(1);
    expect(before.estimates).toHaveLength(2);
    expect(before.sessions[0]?.taskId).toBeDefined();

    const json = JSON.stringify(before);
    const parsed = parseEnvelope(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);

    // Fresh database, then restore.
    await resetDbForTesting();
    await replaceAll(parsed.envelope);

    const db = getDb();
    expect(await db.domains.count()).toBe(4);
    const project = (await projectRepo.getAll())[0]!;
    expect(project.title).toBe('Rebuild portfolio');
    expect(project.cadencePerWeek).toBe(2);
    // Wave 10 fields: optional, so older backups lack them and still import.
    expect(project.cadenceBlockMin).toBe(45);
    // The note's own time (stamped by the repository) is a Date again after the JSON round trip.
    expect(project.breadcrumbAt).toBeInstanceOf(Date);
    expect(project.breadcrumbAt!.getTime()).toBe(before.projects![0]!.breadcrumbAt!.getTime());
    expect(project.stallAfterDays).toBe(10);
    expect(project.breadcrumb).toBe('after this: pick 3 projects');

    const tasks = await taskRepo.getAll();
    expect(tasks).toHaveLength(2);
    const parent = tasks.find((t) => t.title === 'Fix the hose')!;
    expect(parent.nextAction).toBe('find the wrench');
    expect(parent.estimateMin).toBe(20);
    expect(parent.energy).toBe('low');
    expect(parent.context).toEqual(['hardware-store']);
    const child = tasks.find((t) => t.title === 'Buy washer')!;
    expect(child.parentId).toBe(parent.id);
    expect(child.source).toBe('import');

    const block = (await blockRepo.getAll())[0]!;
    expect(block.kind).toBe('focus');
    expect(block.taskId).toBe(parent.id);
    expect(block.start.getTime()).toBe(new Date('2026-10-23T09:00:00').getTime());

    const plan = await dayPlanRepo.getByDate('2026-10-23');
    expect(plan?.picks).toHaveLength(2);
    expect(plan?.capacityMin).toBe(180);
    expect(plan?.shutdownNote).toBe('good day');

    const estimates = await estimateRepo.byTask(parent.id);
    expect(estimates.map((e) => e.source)).toEqual(['user', 'openai']);
    expect(estimates[1]?.rationale).toBe('guess');

    const session = (await sessionRepo.getAll())[0]!;
    expect(session.taskId).toBe(parent.id);
    expect(session.projectId).toBe(project.id);
  });

  it('legacy envelope without Wave 1 keys leaves the new tables untouched', async () => {
    // Simulate a v2 envelope from before Wave 1: no domains/projects/... keys.
    const legacy = await collectAll();
    const stripped = JSON.parse(
      JSON.stringify({
        ...legacy,
        domains: undefined,
        projects: undefined,
        tasks: undefined,
        blocks: undefined,
        dayPlans: undefined,
        estimates: undefined,
      })
    );
    const parsed = parseEnvelope(JSON.stringify(stripped));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.envelope.tasks).toBeUndefined();

    // The current db has Wave 1 data; importing the legacy file keeps it.
    const db = getDb();
    const tasksBefore = await db.tasks.count();
    expect(tasksBefore).toBe(2);
    await replaceAll(parsed.envelope);
    expect(await db.tasks.count()).toBe(tasksBefore); // untouched
    expect(await db.domains.count()).toBe(4); // seed preserved
  });

  it('rejects invalid Wave 1 rows and counts them skipped', async () => {
    const env = await collectAll();
    const tampered = JSON.parse(JSON.stringify(env));
    tampered.tasks.push({ id: 'not-a-uuid', title: 'bad row' });
    tampered.blocks.push({ id: 'also-bad', title: 'no dates', start: 'nope', end: 'nope', kind: 'focus' });
    const parsed = parseEnvelope(JSON.stringify(tampered));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.envelope.tasks).toHaveLength(2); // the two valid ones
    expect(parsed.skipped).toBe(2);
  });
});
