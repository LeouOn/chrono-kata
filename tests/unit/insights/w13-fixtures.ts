import type { Estimate } from '@/lib/schemas/estimate';
import type { Project } from '@/lib/schemas/project';
import type { Session } from '@/lib/schemas/session';
import type { Task, TaskStatus } from '@/lib/schemas/task';

/**
 * Synthetic 90-day work history with KNOWN ground truth (Wave 13 PR 1).
 * Seeded and deterministic: the same seed always builds the same rows.
 *
 * Ground truth baked in:
 * - the user underestimates: their estimate is 0.7x of actual
 *   (ratio actual/user ≈ 1.4286);
 * - model A overestimates 1.3x (ratio ≈ 1.3) and sometimes revises its own
 *   estimate (the LATEST must win);
 * - model B is exact (ratio ≈ 1.0);
 * - three domains split the tasks, energies cycle low/med/high;
 * - two projects carry cadence targets (2 and 3 per week);
 * - some tasks stay in the inbox (captured, never processed).
 */

export const NOW = new Date('2026-06-30T12:00:00Z');

export const DOMAINS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
] as const;

export const BIAS = { user: 0.7, modelA: 1.3, modelB: 1.0 } as const;

export interface SyntheticHistory {
  sessions: Session[];
  tasks: Task[];
  projects: Project[];
  estimates: Estimate[];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuidFrom(n: number, tag: string): string {
  const hex = (n * 2654435761 >>> 0).toString(16).padStart(8, '0');
  const rest = [...tag].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16).padStart(4, '0');
  return `00000000-0000-4000-8000-${hex}${rest}`.slice(0, 36);
}

export function generateHistory(seed: number): SyntheticHistory {
  const rand = mulberry32(seed);
  const tasks: Task[] = [];
  const estimates: Estimate[] = [];
  const sessions: Session[] = [];
  const projects: Project[] = [
    {
      id: 'aaaa0000-0000-4000-8000-000000000001',
      title: 'Trading system',
      domainId: DOMAINS[0],
      status: 'active',
      cadencePerWeek: 2,
      breadcrumb: null,
      lastTouchedAt: NOW,
      createdAt: new Date('2026-04-01T09:00:00Z'),
      updatedAt: NOW,
    },
    {
      id: 'aaaa0000-0000-4000-8000-000000000002',
      title: 'Garden redesign',
      domainId: DOMAINS[1],
      status: 'active',
      cadencePerWeek: 3,
      breadcrumb: null,
      lastTouchedAt: NOW,
      createdAt: new Date('2026-04-01T09:00:00Z'),
      updatedAt: NOW,
    },
  ];

  const dayMs = 24 * 3600 * 1000;
  const start = NOW.getTime() - 90 * dayMs;
  let taskCounter = 0;

  for (let day = 0; day < 90; day++) {
    const perDay = 1 + Math.floor(rand() * 2); // 1-2 tasks per day
    for (let k = 0; k < perDay; k++) {
      taskCounter += 1;
      const createdAt = new Date(start + day * dayMs + Math.floor(rand() * 8 * 3600 * 1000));
      const id = uuidFrom(taskCounter, 'task');
      const projectId = rand() < 0.6 ? projects[Math.floor(rand() * 2)]!.id : null;
      const domainId = projectId == null ? DOMAINS[Math.floor(rand() * 3)] : null; // via project otherwise
      const energy = (['low', 'med', 'high'] as const)[taskCounter % 3];
      // ~12% stay captured-but-unprocessed; the rest are done work.
      const stuckInInbox = rand() < 0.12;
      const status: TaskStatus = stuckInInbox ? 'inbox' : 'done';
      const actualRaw = 15 + Math.floor(rand() * 120); // minutes
      const actual = Math.round(actualRaw * 2) / 2; // 30-second precision
      const userEst = Math.max(1, Math.round(actual * BIAS.user));
      const modelAEst = Math.max(1, Math.round(actual / BIAS.modelA));
      const task: Task = {
        id,
        title: `Task ${taskCounter}`,
        domainId,
        projectId,
        parentId: null,
        status,
        estimateMin: userEst,
        actualMin: status === 'done' ? actual : null,
        energy,
        context: null,
        dueAt: null,
        deferUntil: null,
        source: 'manual',
        createdAt,
        touchedAt: createdAt,
        doneAt: status === 'done' ? new Date(createdAt.getTime() + 2 * 3600 * 1000) : null,
      };
      tasks.push(task);
      if (stuckInInbox) continue;

      // Estimates: user + model A (+ sometimes an earlier, wrong model A that
      // the analytics must NOT use) + model B.
      estimates.push({
        id: uuidFrom(taskCounter * 10 + 1, 'est'),
        taskId: id,
        source: 'user',
        minutes: userEst,
        rationale: null,
        createdAt,
        updatedAt: createdAt,
      });
      if (rand() < 0.4) {
        estimates.push({
          id: uuidFrom(taskCounter * 10 + 2, 'est'),
          taskId: id,
          source: 'modelA',
          minutes: Math.max(1, Math.round(actual * 2)), // an old, bad revision
          rationale: null,
          createdAt: new Date(createdAt.getTime() - 3600 * 1000),
          updatedAt: new Date(createdAt.getTime() - 3600 * 1000),
        });
      }
      estimates.push({
        id: uuidFrom(taskCounter * 10 + 3, 'est'),
        taskId: id,
        source: 'modelA',
        minutes: modelAEst,
        rationale: null,
        createdAt: new Date(createdAt.getTime() + 60 * 1000),
        updatedAt: new Date(createdAt.getTime() + 60 * 1000),
      });
      estimates.push({
        id: uuidFrom(taskCounter * 10 + 4, 'est'),
        taskId: id,
        source: 'modelB',
        minutes: actual, // exact
        rationale: null,
        createdAt,
        updatedAt: createdAt,
      });

      // Sessions attributing exactly `actual` minutes to this task.
      const parts = 1 + Math.floor(rand() * 3);
      let remaining = actual;
      for (let p = 0; p < parts; p++) {
        const minutes = p === parts - 1 ? remaining : Math.round((remaining / (parts - p)) * 2) / 2;
        remaining = Math.round((remaining - minutes) * 2) / 2;
        const startedAt = new Date(createdAt.getTime() + p * 3600 * 1000);
        sessions.push({
          id: uuidFrom(taskCounter * 100 + p, 'ses'),
          startedAt,
          endedAt: new Date(startedAt.getTime() + minutes * 60 * 1000),
          durationMinutes: minutes,
          reps: null,
          rating: 3,
          activityLabel: 'work',
          note: undefined,
          coachComment: null,
          calendarEventId: null,
          failedLLM: false,
          taskId: id,
          projectId,
          blockId: null,
          createdAt: startedAt,
          updatedAt: startedAt,
        } as Session);
      }
    }
  }

  return { sessions, tasks, projects, estimates };
}
