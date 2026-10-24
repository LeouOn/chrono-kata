import { describe, it, expect, beforeEach } from 'vitest';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { blockRepo } from '@/lib/db/block.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { projectRepo } from '@/lib/db/project.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { collectIntegritySnapshot, detectIntegrity } from '@/lib/integrity/detect';

const DAY = 24 * 3_600_000;

describe("a database used the ordinary way stays clean; the detector never throws (from the lead's round-2 probe", () => {
  beforeEach(async () => { await resetDbForTesting(); await settingsRepo.get(); });

  it('R1 projects, tasks through every status, linked sessions, future plans, a recurring series, a day plan', async () => {
    const project = await projectRepo.create({ title: 'Book', status: 'active', cadencePerWeek: 2 } as never);
    const a = await taskRepo.create({ title: 'a', projectId: project.id, dueAt: new Date(Date.now() + 60 * DAY) });
    const b = await taskRepo.create({ title: 'b', deferUntil: new Date(Date.now() + 14 * DAY) });
    await taskRepo.setStatus(a.id, 'next');
    await taskRepo.setStatus(a.id, 'done');
    await taskRepo.setStatus(a.id, 'next'); // reopened: doneAt must be cleared
    await taskRepo.setStatus(b.id, 'next');
    await taskRepo.setStatus(b.id, 'done');
    const block = await blockRepo.create({ start: new Date(Date.now() + 2 * DAY), end: new Date(Date.now() + 2 * DAY + 3_600_000), kind: 'focus', title: 'deep work', taskId: a.id, projectId: project.id });
    for (let i = 0; i < 4; i++) {
      await blockRepo.create({ start: new Date(Date.now() + (i + 1) * 7 * DAY), end: new Date(Date.now() + (i + 1) * 7 * DAY + 1_800_000), kind: 'fixed', title: 'weekly', calendarRef: 'uid-1@x' });
    }
    await sessionRepo.save({ startedAt: new Date(Date.now() - 3_600_000), endedAt: new Date(Date.now() - 1_800_000), durationMinutes: 30, rating: 4, taskId: b.id, projectId: project.id, blockId: block.id } as never);
    await sessionRepo.save({ startedAt: new Date(), endedAt: null, reps: 3, rating: 3 } as never);
    await dayPlanRepo.upsert('2026-10-24', { picks: [a.id, b.id], capacityMin: 120, picksDone: [b.id] });
    const issues = detectIntegrity(await collectIntegritySnapshot(getDb()));
    expect(issues).toEqual([]);
  });
});

// tiny seeded PRNG
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

describe('lead probe r2: totality (fuzz)', () => {
  it('F1 no garbage in any field of any row ever makes the detector throw; output is deterministic and order-independent', () => {
    const rand = rng(20261024);
    const garbage = [undefined, null, 'x', '', 123, -1, NaN, 1e308, true, {}, [], [1, 2], new Date('nope'), new Date(8.64e15), new Date(0), () => 1, { getTime: 5 }, 'not-a-date', { __proto__: null }];
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const fieldsByTable: Record<string, string[]> = {
      sessions: ['id', 'startedAt', 'endedAt', 'createdAt', 'updatedAt', 'taskId', 'projectId', 'blockId', 'durationMinutes', 'reps'],
      tasks: ['id', 'status', 'dueAt', 'deferUntil', 'doneAt', 'createdAt', 'touchedAt', 'parentId', 'projectId', 'domainId'],
      blocks: ['id', 'start', 'end', 'createdAt', 'updatedAt', 'taskId', 'projectId', 'calendarRef'],
      projects: ['id', 'breadcrumbAt', 'lastTouchedAt', 'createdAt', 'updatedAt'],
      domains: ['id'],
      habits: ['id', 'domainId'],
      dayPlans: ['date', 'shutdownAt', 'createdAt', 'updatedAt', 'picksDone', 'picksBack', 'domainChecks'],
    };
    for (let round = 0; round < 300; round++) {
      const snap: Record<string, unknown> = { now: pick([new Date(), undefined, new Date('nope')]) };
      for (const [table, fields] of Object.entries(fieldsByTable)) {
        const rows = [];
        const n = Math.floor(rand() * 6);
        for (let r = 0; r < n; r++) {
          const row: Record<string, unknown> = {};
          for (const f of fields) if (rand() < 0.8) row[f] = rand() < 0.5 ? pick(garbage) : f === 'id' ? id(Math.floor(rand() * 4)) : new Date(Date.now() + (rand() - 0.5) * 5 * DAY);
          rows.push(row);
        }
        snap[table] = rows;
      }
      snap.settings = pick([null, undefined, 'str', 42, {}, [], { id: 'singleton' }]);
      let out1: unknown; let out2: unknown;
      expect(() => { out1 = detectIntegrity(snap as never); }).not.toThrow();
      const shuffled = { ...snap } as Record<string, unknown>;
      for (const t of Object.keys(fieldsByTable)) shuffled[t] = [...(snap[t] as unknown[])].reverse();
      expect(() => { out2 = detectIntegrity(shuffled as never); }).not.toThrow();
      expect(JSON.stringify(out2, (_k, v) => (typeof v === 'function' ? 'fn' : v))).toBe(JSON.stringify(out1, (_k, v) => (typeof v === 'function' ? 'fn' : v)));
    }
  });
});
