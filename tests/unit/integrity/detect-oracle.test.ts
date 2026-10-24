import { describe, it, expect } from 'vitest';
import {
  detectIntegrity,
  DETECTOR_TABLES,
  PLANNED_DATE_FIELDS,
  futureDateFields,
  unreadableDateFields,
  type IntegrityIssue,
  type IntegritySnapshot,
} from '@/lib/integrity/detect';
import type { Session } from '@/lib/schemas/session';
import type { Task } from '@/lib/schemas/task';
import type { Project } from '@/lib/schemas/project';
import type { Domain } from '@/lib/schemas/domain';
import type { Block } from '@/lib/schemas/block';
import type { DayPlan } from '@/lib/schemas/day-plan';
import type { Habit } from '@/lib/schemas/habit';
import { DEFAULT_SETTINGS } from '@/lib/schemas/settings';
import type { Settings } from '@/lib/schemas/settings';

/**
 * Oracle for the integrity detector (Wave 20 part 2), in the style of
 * tests/unit/planning/oracle.test.ts: seeded random databases with injected
 * corruptions of every kind; the detector must report EXACTLY the injected
 * set — no more, no fewer — deterministically, with the right severity.
 */

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = new Date('2026-10-24T12:00:00Z');

// ── Valid row factories ──────────────────────────────────────────────────────
let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function domain(): Domain {
  const t = new Date(NOW.getTime() - 86_400_000);
  return { id: uid(), name: `d${n}`, order: n, createdAt: t, updatedAt: t };
}

function project(domainId: string | null): Project {
  const t = new Date(NOW.getTime() - 86_400_000);
  return { id: uid(), title: `p${n}`, domainId, status: 'active', lastTouchedAt: t, createdAt: t, updatedAt: t };
}

function task(over: Partial<Task> = {}): Task {
  const t = new Date(NOW.getTime() - 3_600_000);
  return {
    id: uid(),
    title: `t${n}`,
    status: 'inbox',
    source: 'manual',
    createdAt: t,
    touchedAt: t,
    ...over,
  };
}

function session(over: Partial<Session> = {}): Session {
  const t = new Date(NOW.getTime() - 1_800_000);
  return {
    id: uid(),
    startedAt: t,
    endedAt: null,
    durationMinutes: 20,
    reps: null,
    rating: 4,
    createdAt: t,
    updatedAt: t,
    ...over,
  };
}

function block(over: Partial<Block> = {}): Block {
  const t = new Date(NOW.getTime() - 900_000);
  return {
    id: uid(),
    start: t,
    end: new Date(t.getTime() + 1_800_000),
    kind: 'focus',
    title: `b${n}`,
    createdAt: t,
    updatedAt: t,
    ...over,
  };
}

function dayPlan(over: Partial<DayPlan> = {}): DayPlan {
  const t = new Date(NOW.getTime() - 43_200_000);
  return {
    date: `2026-10-${String((n % 28) + 1).padStart(2, '0')}`,
    picks: [],
    capacityMin: 120,
    createdAt: t,
    updatedAt: t,
    ...over,
  };
}

function habit(over: Partial<Habit> = {}): Habit {
  const t = new Date(NOW.getTime() - 86_400_000);
  return {
    id: uid(),
    name: `h${n}`,
    icon: '✅',
    kind: 'boolean',
    targetPerDay: null,
    schedule: { kind: 'daily' },
    order: n,
    createdAt: t,
    updatedAt: t,
    ...over,
  };
}

function validSettings(): Settings {
  // The one true defaults row, exactly as the repository would create it.
  return {
    ...DEFAULT_SETTINGS,
    createdAt: new Date(NOW.getTime() - 86_400_000),
    updatedAt: new Date(NOW.getTime() - 86_400_000),
  };
}

/** A coherent baseline: every link resolves, every invariant holds. */
function coherentBase(): IntegritySnapshot {
  const d = domain();
  const p = project(d.id);
  const parent = task({ domainId: d.id });
  const child = task({ parentId: parent.id, projectId: p.id, domainId: d.id });
  const b = block({ taskId: child.id, projectId: p.id });
  const s = session({ taskId: child.id, projectId: p.id, blockId: b.id });
  const plan = dayPlan({
    picks: [child.id],
    picksDone: [child.id],
    domainChecks: { [d.id]: true },
  });
  const h = habit({ domainId: d.id });
  return {
    sessions: [s],
    tasks: [parent, child],
    projects: [p],
    domains: [d],
    blocks: [b],
    dayPlans: [plan],
    habits: [h],
    settings: validSettings(),
    now: NOW,
  };
}

// ── Corruption injections: (mutator, expected kind, severity) ────────────────
const GONE = '00000000-0000-4000-8000-00000000dead';

interface Injection {
  apply: (s: IntegritySnapshot) => void;
  kind: IntegrityIssue['kind'];
  severity: IntegritySeverity;
}
type IntegritySeverity = IntegrityIssue['severity'];

const INJECTIONS: Injection[] = [
  { apply: (s) => void (s.projects[0]!.domainId = GONE), kind: 'project-orphan-domain', severity: 'corruption' },
  { apply: (s) => void (s.sessions[0]!.taskId = GONE), kind: 'session-orphan-task', severity: 'corruption' },
  { apply: (s) => void (s.sessions[0]!.projectId = GONE), kind: 'session-orphan-project', severity: 'corruption' },
  { apply: (s) => void (s.sessions[0]!.blockId = GONE), kind: 'session-orphan-block', severity: 'corruption' },
  {
    apply: (s) => void (s.sessions[0]!.endedAt = new Date(s.sessions[0]!.startedAt.getTime() - 1000)),
    kind: 'session-bad-range',
    severity: 'corruption',
  },
  { apply: (s) => void (s.blocks[0]!.taskId = GONE), kind: 'block-orphan-task', severity: 'corruption' },
  { apply: (s) => void (s.blocks[0]!.projectId = GONE), kind: 'block-orphan-project', severity: 'corruption' },
  {
    apply: (s) => void (s.blocks[0]!.end = new Date(s.blocks[0]!.start.getTime() - 1)),
    kind: 'block-bad-range',
    severity: 'corruption',
  },
  { apply: (s) => void (s.tasks[1]!.parentId = GONE), kind: 'task-orphan-parent', severity: 'corruption' },
  { apply: (s) => void (s.tasks[1]!.projectId = GONE), kind: 'task-orphan-project', severity: 'corruption' },
  { apply: (s) => void (s.tasks[1]!.domainId = GONE), kind: 'task-orphan-domain', severity: 'corruption' },
  {
    apply: (s) => void ((s.tasks[0] as Task & { doneAt?: Date | null }).doneAt = new Date(NOW.getTime() - 60_000)),
    kind: 'task-done-inconsistent',
    severity: 'corruption',
  },
  { apply: (s) => void (s.habits[0]!.domainId = GONE), kind: 'habit-orphan-domain', severity: 'corruption' },
  {
    apply: (s) => void (s.settings = { ...(s.settings as Settings), displayName: 42 as unknown as string }),
    kind: 'settings-invalid',
    severity: 'corruption',
  },
  {
    apply: (s) => void (s.sessions[0]!.createdAt = new Date(NOW.getTime() + 48 * 3_600_000)),
    kind: 'row-date-in-future',
    severity: 'corruption',
  },
  {
    apply: (s) => void (s.dayPlans[0]!.shutdownAt = new Date(NOW.getTime() + 48 * 3_600_000)),
    kind: 'row-date-in-future',
    severity: 'corruption',
  },
  // The KNOWN, documented DayPlan properties: informational, not corruption.
  {
    apply: (s) => void (s.dayPlans[0]!.picksDone = [GONE]),
    kind: 'dayplan-dead-pick',
    severity: 'info',
  },
  {
    apply: (s) => void (s.dayPlans[0]!.picksBack = [GONE]),
    kind: 'dayplan-dead-pick',
    severity: 'info',
  },
  {
    apply: (s) => void (s.dayPlans[0]!.domainChecks = { [GONE]: true }),
    kind: 'dayplan-dead-domain-check',
    severity: 'info',
  },
];

/** Two blocks sharing ref AND start instant → the real duplicate. */
function injectDuplicateRef(s: IntegritySnapshot): void {
  const first = s.blocks[0]!;
  const second = block({ calendarRef: first.calendarRef, start: first.start, end: first.end });
  first.calendarRef = 'cal-shared';
  second.calendarRef = 'cal-shared';
  (s.blocks as Block[]).push(second);
}

/** A recurring event: many blocks, one ref, different starts — DESIGNED, clean. */
function injectRecurringSeries(s: IntegritySnapshot): void {
  const base = s.blocks[0]!;
  for (let i = 1; i <= 3; i++) {
    (s.blocks as Block[]).push(
      block({
        calendarRef: 'cal-series',
        start: new Date(base.start.getTime() + i * 86_400_000),
        end: new Date(base.end.getTime() + i * 86_400_000),
      })
    );
  }
}

describe('integrity detector oracle', () => {
  it('a coherent database yields zero issues of either severity', () => {
    expect(detectIntegrity(coherentBase())).toEqual([]);
  });

  it('every corruption and info kind alone: exactly one issue, correct severity, nothing else', () => {
    for (const inj of INJECTIONS) {
      const snap = coherentBase();
      inj.apply(snap);
      const issues = detectIntegrity(snap);
      expect(issues, `${inj.kind} alone`).toHaveLength(1);
      expect(issues[0]!.kind, `${inj.kind} kind`).toBe(inj.kind);
      expect(issues[0]!.severity, `${inj.kind} severity`).toBe(inj.severity);
    }
  });

  it('duplicate calendar ref = same ref AND same start; a recurring series sharing one ref is clean', () => {
    const series = coherentBase();
    injectRecurringSeries(series);
    expect(detectIntegrity(series)).toEqual([]);

    const dup = coherentBase();
    injectDuplicateRef(dup);
    const issues = detectIntegrity(dup);
    expect(issues).toHaveLength(1);
    const issue = issues[0] as Extract<IntegrityIssue, { kind: 'block-duplicate-calendar-ref' }>;
    expect(issue.blockIds).toEqual(dup.blocks.map((b) => b.id).sort());
    expect(issue.calendarRef).toBe('cal-shared');
    expect(issue.startIso).toBe(dup.blocks[0]!.start.toISOString());
  });

  it('seeded random databases: EXACTLY the injected set (no more, no fewer), deterministic under shuffling', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rand = mulberry32(seed);
      const snap = coherentBase();
      const expected = new Map<string, IntegritySeverity>();

      for (const inj of INJECTIONS) {
        if (rand() < 0.5) continue;
        inj.apply(snap);
        expected.set(inj.kind, inj.severity);
      }
      if (rand() < 0.5) {
        injectDuplicateRef(snap);
        expected.set('block-duplicate-calendar-ref', 'corruption');
      }

      const issues = detectIntegrity(snap);
      const kinds = new Set(issues.map((i) => i.kind));
      expect([...kinds].sort(), `seed ${seed}: kinds`).toEqual([...expected.keys()].sort());
      for (const issue of issues) {
        expect(issue.severity, `seed ${seed}: ${issue.kind} severity`).toBe(expected.get(issue.kind));
      }

      const shuffled: IntegritySnapshot = {
        ...snap,
        sessions: [...snap.sessions].reverse(),
        tasks: [...snap.tasks].reverse(),
        blocks: [...snap.blocks].reverse(),
        dayPlans: [...snap.dayPlans].reverse(),
      };
      expect(
        detectIntegrity(shuffled).map((i) => JSON.stringify(i)),
        `seed ${seed}: deterministic`
      ).toEqual(issues.map((i) => JSON.stringify(i)));
    }
  });

  it('a zero-length session is LEGAL (SessionSchema has no end>start refine); only end<start is bad', () => {
    const zero = coherentBase();
    zero.sessions[0]!.endedAt = new Date(zero.sessions[0]!.startedAt.getTime());
    expect(detectIntegrity(zero)).toEqual([]);

    const reversed = coherentBase();
    reversed.sessions[0]!.endedAt = new Date(reversed.sessions[0]!.startedAt.getTime() - 1);
    const issues = detectIntegrity(reversed);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'session-bad-range' });
  });

  it('done/status coupling is caught in BOTH directions', () => {
    const withDoneAt = coherentBase();
    (withDoneAt.tasks[0] as Task & { doneAt?: Date | null }).doneAt = new Date();
    expect(detectIntegrity(withDoneAt).map((i) => i.kind)).toEqual(['task-done-inconsistent']);

    const statusDoneNoAt = coherentBase();
    const t = statusDoneNoAt.tasks[0]!;
    (t as Task & { status: Task['status'] }).status = 'done';
    (t as Task & { doneAt?: Date | null }).doneAt = null;
    expect(detectIntegrity(statusDoneNoAt).map((i) => i.kind)).toEqual(['task-done-inconsistent']);
  });

  it('the far-future boundary is exactly 24h ahead of now, per DATE_SPECS field', () => {
    const justInside = coherentBase();
    justInside.sessions[0]!.createdAt = new Date(NOW.getTime() + 23 * 3_600_000);
    expect(detectIntegrity(justInside)).toEqual([]);

    const justOutside = coherentBase();
    justOutside.sessions[0]!.createdAt = new Date(NOW.getTime() + 25 * 3_600_000);
    const issues = detectIntegrity(justOutside);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'row-date-in-future', field: 'createdAt', id: justOutside.sessions[0]!.id });

    // Event fields count, planned fields do not: dueAt 30 days ahead is a
    // PLAN (clean); doneAt 2 days ahead is impossible (flagged).
    const planned = coherentBase();
    planned.tasks[0]!.dueAt = new Date(NOW.getTime() + 30 * 86_400_000);
    planned.tasks[0]!.deferUntil = new Date(NOW.getTime() + 7 * 86_400_000);
    planned.blocks[0]!.start = new Date(NOW.getTime() + 3 * 86_400_000);
    planned.blocks[0]!.end = new Date(NOW.getTime() + 3 * 86_400_000 + 3_600_000);
    expect(detectIntegrity(planned)).toEqual([]);

    const futureDone = coherentBase();
    futureDone.tasks[0]!.status = 'done';
    futureDone.tasks[0]!.doneAt = new Date(NOW.getTime() + 48 * 3_600_000);
    expect(detectIntegrity(futureDone)[0]).toMatchObject({ kind: 'row-date-in-future', field: 'doneAt' });
  });

  it('a live pick whose task exists is NOT a dead pick (known-good stays silent)', () => {
    const snap = coherentBase();
    snap.dayPlans[0]!.picksDone = [snap.tasks[1]!.id];
    snap.dayPlans[0]!.picksBack = [];
    expect(detectIntegrity(snap)).toEqual([]);
  });

  it('row-date-unreadable: present-but-invalid dates are corruption; the detector stays TOTAL', () => {
    // A string where a Date belongs (the shape a bad import leaves).
    const asString = coherentBase();
    (asString.sessions[0] as unknown as Record<string, unknown>).endedAt = 'not-a-date';
    let issues = detectIntegrity(asString);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'row-date-unreadable', field: 'endedAt' });

    // NaN Date: comparisons with it are false, so it must be named explicitly.
    const nan = coherentBase();
    (nan.tasks[0] as Task & { doneAt?: Date }).doneAt = new Date(Number.NaN);
    (nan.tasks[0] as Task & { status: Task['status'] }).status = 'done';
    issues = detectIntegrity(nan);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'row-date-unreadable', field: 'doneAt' });

    // A range with an unreadable endpoint reports ONLY the unreadable issue.
    const mixed = coherentBase();
    (mixed.blocks[0] as unknown as Record<string, unknown>).end = 42;
    issues = detectIntegrity(mixed);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'row-date-unreadable', field: 'end' });
  });

  it('TOTALITY: a fully garbled row reports instead of throwing', () => {
    const snap = coherentBase();
    (snap.sessions as unknown[])[0] = {
      id: 7, // not even a string id
      startedAt: { nope: true },
      endedAt: 'whenever',
      taskId: {}, // not a string: not a link, so no orphan claim either
    } as never;
    const issues = detectIntegrity(snap); // must not throw
    expect(issues.map((i) => i.kind).sort()).toEqual(['row-date-unreadable', 'row-date-unreadable']);
  });

  it('completeness: every DATE_SPECS field of the detector tables is checked or excluded BY NAME', () => {
    for (const table of DETECTOR_TABLES) {
      const spec = unreadableDateFields(table);
      const future = futureDateFields(table);
      const planned: readonly string[] =
        PLANNED_DATE_FIELDS[table as keyof typeof PLANNED_DATE_FIELDS] ?? [];
      // Everything in DATE_SPECS is covered by the unreadable check.
      for (const field of spec) {
        expect(future.includes(field) || planned.includes(field), `${table}.${field} neither checked nor excluded`).toBe(true);
      }
      // Exclusions must be real DATE_SPECS fields (no stale names) and never
      // double-booked as future-checked.
      for (const field of planned) {
        expect(spec, `${table}.${field} is excluded but not in DATE_SPECS`).toContain(field);
        expect(future).not.toContain(field);
      }
    }
  });

  it('BEHAVIORAL completeness: every future-checked field flags far-future, every planned field stays clean', () => {
    for (const table of DETECTOR_TABLES) {
      for (const field of futureDateFields(table)) {
        const snap = coherentBase();
        const row =
          table === 'sessions' ? (snap.sessions[0] as unknown as Record<string, unknown>)
          : table === 'tasks' ? (snap.tasks[0] as unknown as Record<string, unknown>)
          : table === 'blocks' ? (snap.blocks[0] as unknown as Record<string, unknown>)
          : table === 'projects' ? (snap.projects[0] as unknown as Record<string, unknown>)
          : (snap.dayPlans[0] as unknown as Record<string, unknown>);
        row[field] = new Date(NOW.getTime() + 48 * 3_600_000);
        const flagged = detectIntegrity(snap).filter(
          (i) => i.kind === 'row-date-in-future'
        );
        expect(
          flagged.some((i) => (i as { field: string }).field === field),
          `${table}.${field} far-future was not flagged`
        ).toBe(true);
      }
      const planned: readonly string[] =
        PLANNED_DATE_FIELDS[table as keyof typeof PLANNED_DATE_FIELDS] ?? [];
      for (const field of planned) {
        const snap = coherentBase();
        const row =
          table === 'tasks'
            ? (snap.tasks[0] as unknown as Record<string, unknown>)
            : (snap.blocks[0] as unknown as Record<string, unknown>);
        row[field] = new Date(NOW.getTime() + 30 * 86_400_000);
        expect(
          detectIntegrity(snap).filter((i) => i.kind === 'row-date-in-future'),
          `${table}.${field} planned-future was flagged`
        ).toEqual([]);
      }
    }
  });

  it('a calendarRef containing a pipe cannot break the duplicate rule (Q1)', () => {
    const snap = coherentBase();
    const first = snap.blocks[0]!;
    const second = block({ calendarRef: first.calendarRef, start: first.start, end: first.end });
    first.calendarRef = 'meeting|42@example.com';
    second.calendarRef = 'meeting|42@example.com';
    (snap.blocks as Block[]).push(second);
    const issues = detectIntegrity(snap);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: 'block-duplicate-calendar-ref',
      calendarRef: 'meeting|42@example.com',
      startIso: first.start.toISOString(),
    });
  });
});



