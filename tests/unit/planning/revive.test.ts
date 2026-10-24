import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '@/lib/pacing/days';
import {
  EMPTY_REVIVE_STATE,
  REVIVE_SNOOZE_DAYS,
  dismissRevive,
  minimumSessionLink,
  parseReviveState,
  selectRevive,
  type ReviveState,
} from '@/lib/planning/revive';
import { REVIVE_STORAGE_KEY, readReviveState, writeReviveState } from '@/lib/planning/revive-store';
import { MINIMUM_SESSION_MIN, detectStalls } from '@/lib/planning/stall';
import { toLocalDateString } from '@/lib/utils/date';
import { DST_WEEK_MONDAYS, ZONES, dayKeys, inZone, local, makeProject, makeSession } from './w10-helpers';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const stallsOf = (projects: ReturnType<typeof makeProject>[], now: Date, sessions: ReturnType<typeof makeSession>[] = []) =>
  detectStalls({ projects, sessions, tasks: [], now });

describe('minimumSessionLink: the ten-minute session', () => {
  it('is an ordinary project link with a ten-minute timer and the title as its label', () => {
    const project = makeProject({ title: 'Write the novel' });
    expect(minimumSessionLink(project)).toEqual({ projectId: project.id, label: 'Write the novel', estimateMin: 10 });
    expect(MINIMUM_SESSION_MIN).toBe(10);
  });

  it('keeps the label within the session form\'s 50 characters', () => {
    const project = makeProject({ title: 'x'.repeat(200) });
    expect(minimumSessionLink(project).label).toHaveLength(50);
  });
});

describe('parseReviveState: stored state is never trusted', () => {
  it('accepts exactly the shape it writes', () => {
    const state: ReviveState = { quietDay: '2026-06-17', snoozedUntil: { abc: '2026-06-20' } };
    expect(parseReviveState(state)).toEqual(state);
    expect(parseReviveState(EMPTY_REVIVE_STATE)).toEqual(EMPTY_REVIVE_STATE);
  });

  it('turns anything else into "nothing remembered", never an exception', () => {
    const junk: unknown[] = [
      null, undefined, 7, 'text', [], {}, { quietDay: 5, snoozedUntil: {} },
      { quietDay: '17 June', snoozedUntil: {} }, { quietDay: null, snoozedUntil: { a: 'tomorrow' } },
      { quietDay: null, snoozedUntil: [] }, { quietDay: null }, { snoozedUntil: {} },
    ];
    for (const value of junk) expect(parseReviveState(value), JSON.stringify(value)).toEqual(EMPTY_REVIVE_STATE);
  });
});

describe('selectRevive', () => {
  inZone('UTC', () => undefined);
  const stall = (title: string, daysAgo: number) =>
    stallsOf([makeProject({ title, lastTouchedAt: local(addDays('2026-06-17', -daysAgo), 9) })], local('2026-06-17', 8))[0]!;
  const a = stall('A', 10);
  const b = stall('B', 20);

  it('offers nothing when nothing is quiet', () => {
    expect(selectRevive([], EMPTY_REVIVE_STATE, '2026-06-17')).toBeNull();
  });

  it('offers the first project in stall order', () => {
    expect(selectRevive([a, b], EMPTY_REVIVE_STATE, '2026-06-17')?.project.id).toBe(a.project.id);
  });

  it('skips a project that is put aside, and offers the next', () => {
    const state: ReviveState = { quietDay: null, snoozedUntil: { [a.project.id]: '2026-06-20' } };
    expect(selectRevive([a, b], state, '2026-06-17')?.project.id).toBe(b.project.id);
  });

  it('offers a put-aside project again on the day its rest ends, not the day before', () => {
    const state: ReviveState = { quietDay: null, snoozedUntil: { [a.project.id]: '2026-06-20' } };
    expect(selectRevive([a], state, '2026-06-19')).toBeNull();
    expect(selectRevive([a], state, '2026-06-20')?.project.id).toBe(a.project.id);
    expect(selectRevive([a], state, '2026-06-21')?.project.id).toBe(a.project.id);
  });

  it('makes no offer at all on a day the user already answered one', () => {
    expect(selectRevive([a, b], { quietDay: '2026-06-17', snoozedUntil: {} }, '2026-06-17')).toBeNull();
    expect(selectRevive([a, b], { quietDay: '2026-06-16', snoozedUntil: {} }, '2026-06-17')?.project.id).toBe(a.project.id);
  });
});

describe('dismissRevive', () => {
  it('rests the project for three days and ends today\'s offers', () => {
    const next = dismissRevive(EMPTY_REVIVE_STATE, 'p1', '2026-06-17');
    expect(next).toEqual({ quietDay: '2026-06-17', snoozedUntil: { p1: '2026-06-20' } });
    expect(REVIVE_SNOOZE_DAYS).toBe(3);
  });

  it('crosses month and year ends by calendar', () => {
    expect(dismissRevive(EMPTY_REVIVE_STATE, 'p', '2026-12-30').snoozedUntil.p).toBe('2027-01-02');
    expect(dismissRevive(EMPTY_REVIVE_STATE, 'p', '2028-02-28').snoozedUntil.p).toBe('2028-03-02');
  });

  it('forgets rests that have ended, keeps the live ones, and replaces a project\'s own entry', () => {
    const state: ReviveState = {
      quietDay: '2026-06-10',
      snoozedUntil: { old: '2026-06-12', today: '2026-06-17', live: '2026-06-19', again: '2026-06-18' },
    };
    const next = dismissRevive(state, 'again', '2026-06-17');
    expect(next.snoozedUntil).toEqual({ live: '2026-06-19', again: '2026-06-20' }); // old and today's-end dropped
  });

  it('stays bounded and never mutates its input', () => {
    const many: ReviveState = {
      quietDay: null,
      snoozedUntil: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`p${i}`, '2026-07-01'])),
    };
    const frozen = JSON.stringify(many);
    const next = dismissRevive(many, 'new', '2026-06-17');
    expect(Object.keys(next.snoozedUntil).length).toBeLessThanOrEqual(50);
    expect(next.snoozedUntil.new).toBe('2026-06-20');
    expect(JSON.stringify(many)).toBe(frozen);
  });
});

describe('simulated days: restraint holds across clock changes (six zones)', () => {
  for (const zone of ZONES) {
    it(`a user who puts every offer aside is offered at most one card a day, each project at most every 3 days, in ${zone}`, () => {
      inZone(zone, () => {
        for (const dstMonday of DST_WEEK_MONDAYS[zone]) {
          const start = addDays(dstMonday, -7);
          const projects = [6, 11, 16, 21, 26].map((ago, index) =>
            makeProject({ title: `P${index}`, lastTouchedAt: local(addDays(start, -ago), 9) }),
          );
          let state = EMPTY_REVIVE_STATE;
          const offered: { day: string; id: string }[] = [];
          for (const day of dayKeys(start, 28)) {
            const now = local(day, 8);
            const today = toLocalDateString(now);
            const pick = selectRevive(stallsOf(projects, now), state, today);
            if (pick) {
              offered.push({ day: today, id: pick.project.id });
              state = dismissRevive(state, pick.project.id, today);
            }
          }
          // At most one offer per day, and there was one on the first day.
          expect(new Set(offered.map((o) => o.day)).size).toBe(offered.length);
          expect(offered[0]?.day).toBe(start);
          // The same project is never offered twice within the rest period.
          const lastSeen = new Map<string, string>();
          for (const { day, id } of offered) {
            const before = lastSeen.get(id);
            if (before) expect(day >= addDays(before, REVIVE_SNOOZE_DAYS), `${id} on ${before} then ${day}`).toBe(true);
            lastSeen.set(id, day);
          }
          // Intended: the few most recently quiet projects take turns; the longest-quiet ones rest.
          const ids = new Set(offered.map((o) => o.id));
          expect(ids.size).toBeLessThanOrEqual(REVIVE_SNOOZE_DAYS);
          expect(ids.has(projects[4]!.id)).toBe(false);
        }
      });
    });
  }

  it('does not move on while the user has not answered: the same project stays on offer', () => {
    inZone('UTC', () => {
      const projects = [makeProject({ lastTouchedAt: local('2026-06-01', 9) }), makeProject({ lastTouchedAt: local('2026-05-01', 9) })];
      const ids = dayKeys('2026-06-17', 6).map((day) => selectRevive(stallsOf(projects, local(day, 8)), EMPTY_REVIVE_STATE, day)?.project.id);
      expect(new Set(ids).size).toBe(1);
      expect(ids[0]).toBe(projects[0]!.id);
    });
  });

  it('stops offering a project once it has been worked on', () => {
    inZone('Europe/Helsinki', () => {
      const project = makeProject({ lastTouchedAt: local('2026-06-01', 9) });
      const session = makeSession({ projectId: project.id, startedAt: local('2026-06-18', 10) });
      const before = selectRevive(stallsOf([project], local('2026-06-17', 8)), EMPTY_REVIVE_STATE, '2026-06-17');
      const after = selectRevive(stallsOf([project], local('2026-06-19', 8), [session]), EMPTY_REVIVE_STATE, '2026-06-19');
      expect(before?.project.id).toBe(project.id);
      expect(after).toBeNull(); // worked on yesterday: not quiet
    });
  });

  it('offers nothing for a project that is paused, finished or let go', () => {
    inZone('UTC', () => {
      const projects = (['paused', 'done', 'dropped'] as const).map((status) => makeProject({ status, lastTouchedAt: local('2026-01-01', 9) }));
      expect(selectRevive(stallsOf(projects, local('2026-06-17', 8)), EMPTY_REVIVE_STATE, '2026-06-17')).toBeNull();
    });
  });
});

describe('the revive store (this device only)', () => {
  it('round-trips, and reads nothing as nothing', () => {
    expect(readReviveState()).toEqual(EMPTY_REVIVE_STATE);
    const state = dismissRevive(EMPTY_REVIVE_STATE, 'p1', '2026-06-17');
    expect(writeReviveState(state)).toBe(true);
    expect(readReviveState()).toEqual(state);
    expect(localStorage.getItem(REVIVE_STORAGE_KEY)).toContain('p1');
  });

  it('survives corrupt or wrongly-shaped stored values', () => {
    localStorage.setItem(REVIVE_STORAGE_KEY, '{not json');
    expect(readReviveState()).toEqual(EMPTY_REVIVE_STATE);
    localStorage.setItem(REVIVE_STORAGE_KEY, JSON.stringify({ quietDay: 'soon' }));
    expect(readReviveState()).toEqual(EMPTY_REVIVE_STATE);
  });

  it('never throws when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(readReviveState()).toEqual(EMPTY_REVIVE_STATE);
    expect(writeReviveState({ quietDay: '2026-06-17', snoozedUntil: {} })).toBe(false);
  });
});
