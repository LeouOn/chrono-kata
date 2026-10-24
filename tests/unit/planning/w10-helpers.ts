/**
 * Shared helpers for the Wave 10 tests (cadence, stall, untouched).
 *
 * Not a test file (no `.test.` in the name), so vitest does not collect it.
 *
 * The oracle here shares nothing with the code under test: local day keys come
 * from `Intl.DateTimeFormat` with an explicit `timeZone`, while the code reads
 * `Date#getFullYear()` and friends under `process.env.TZ`. If both agree over
 * thousands of random instants in seven zones, the calendar arithmetic is right.
 */
import { SessionSchema, type Session } from '@/lib/schemas/session';
import { ProjectSchema, type Project } from '@/lib/schemas/project';
import { TaskSchema, type Task } from '@/lib/schemas/task';
import { addDays } from '@/lib/pacing/days';

/** The zones the roadmap asks for, in the order the gate runs them. */
export const ZONES = [
  'UTC',
  'Europe/Helsinki',
  'America/Los_Angeles',
  'Pacific/Kiritimati',
  'Pacific/Auckland',
  'Asia/Kolkata',
] as const;
export type Zone = (typeof ZONES)[number];

/**
 * Mondays of the weeks that contain a DST change (the Sunday is the change).
 * Zones without DST (UTC, Kiritimati, Kolkata) get ordinary weeks.
 */
export const DST_WEEK_MONDAYS: Record<Zone, readonly string[]> = {
  UTC: ['2026-03-23', '2026-10-19'],
  'Europe/Helsinki': ['2026-03-23', '2026-10-19'], // changes 2026-03-29 and 2026-10-25
  'America/Los_Angeles': ['2026-03-02', '2026-10-26'], // changes 2026-03-08 and 2026-11-01
  'Pacific/Kiritimati': ['2026-03-23', '2026-10-19'],
  'Pacific/Auckland': ['2026-03-30', '2026-09-21'], // changes 2026-04-05 and 2026-09-27
  'Asia/Kolkata': ['2026-03-23', '2026-10-19'],
};

const previousTz = process.env.TZ;

/** Run `body` with the process clock in `zone`; always restores the old zone. */
export function inZone<T>(zone: string, body: () => T): T {
  process.env.TZ = zone;
  try {
    return body();
  } finally {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  }
}

/** A deterministic generator (mulberry32). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!,
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof seeded>;

/** The oracle's local day key for an instant: independent of `process.env.TZ`. */
export function intlDayKey(date: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Whole calendar days between two day keys, by plain UTC arithmetic. */
export function keyDiff(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = toKey.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** A local wall-clock instant in the current process zone. */
export function local(dayKey: string, hour = 9, minute = 0, second = 0): Date {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hour, minute, second);
}

/** `count` consecutive local day keys starting at `startKey`. */
export function dayKeys(startKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(startKey, index));
}

/** 0 = Sunday ... 6 = Saturday, for a bare day key. */
export function weekdayOf(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

let seq = 0;
const uuid = (prefix: string) => `${prefix}-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export function makeProject(partial: Partial<Project> = {}): Project {
  return ProjectSchema.parse({
    id: uuid('22222222'),
    title: `project ${seq}`,
    status: 'active',
    lastTouchedAt: new Date(2026, 0, 1),
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    ...partial,
  });
}

export function makeTask(partial: Partial<Task> = {}): Task {
  const at = new Date(2026, 0, 1, 9, 0, seq % 60);
  return TaskSchema.parse({
    id: uuid('11111111'),
    title: `task ${seq}`,
    status: 'next',
    source: 'manual',
    createdAt: at,
    touchedAt: at,
    ...partial,
  });
}

export function makeSession(partial: Partial<Session> = {}): Session {
  const at = partial.startedAt ?? new Date(2026, 0, 1, 9, 0);
  return SessionSchema.parse({
    id: uuid('33333333'),
    startedAt: at,
    durationMinutes: 20,
    rating: 3,
    createdAt: at,
    updatedAt: at,
    ...partial,
  });
}

/** Words the app promises never to use about the user's own work. */
export const GUILT = /overdue|\blate\b|behind|missed|failed|should have|dropped|abandon|neglect|slack/i;
