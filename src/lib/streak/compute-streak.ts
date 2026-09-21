import type { Session } from '@/lib/schemas/session';
import type { Streak } from '@/lib/schemas/streak';
import type { DayOfWeek } from '@/lib/schemas/settings';
import { isNewMilestone } from './milestones';
import { toLocalDateString } from '@/lib/utils/date';

export interface ComputeStreakArgs {
  sessions: Session[];
  previousStreak: Streak;
  now: Date;
  restDays?: DayOfWeek[];
  streakFreezeTokens?: number;
}

const DAY_NAMES: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function getDayOfWeek(date: Date): DayOfWeek {
  return DAY_NAMES[date.getDay()]!;
}

/**
 * Compute streak state with rest day exemptions and streak freeze recovery.
 *
 * Walk backwards day by day from today:
 * 1. If date has a session: increment count.
 * 2. If date has NO session:
 *    - If date is today: 1-day grace period (user hasn't practiced *yet* today).
 *    - Else if date is in restDays: exempted, continues walk without breaking streak.
 *    - Else if date is in the current freeze set: already covered by a
 *      previously spent token, no new charge.
 *    - Else if a freeze token is available: spend one and record the date.
 *    - Else: streak gap reached, terminates walk.
 *
 * The walk is iterated to a fixed point over the freeze set: a spend on a
 * date the walk can no longer reach is voided and its token re-spent on the
 * newest gap, so a single call yields the same result as repeated calls
 * with unchanged sessions. Dates no longer protecting a live streak are
 * pruned, refunding their tokens.
 */
export function computeStreak({
  sessions,
  previousStreak,
  now,
  restDays = [],
  streakFreezeTokens = 0,
}: ComputeStreakArgs): Streak {
  if (sessions.length === 0) {
    return {
      ...previousStreak,
      currentStreakDays: 0,
      freezeUsedOn: [],
      updatedAt: now,
    };
  }

  // Set of local YYYY-MM-DD strings that have at least one session.
  const sessionDays = new Set(sessions.map((s) => toLocalDateString(s.startedAt)));
  const restDaySet = new Set<DayOfWeek>(restDays);

  let oldestSessionStr = '';
  for (const d of sessionDays) {
    if (oldestSessionStr === '' || d < oldestSessionStr) oldestSessionStr = d;
  }

  const todayStr = toLocalDateString(now);

  const walk = (used: Set<string>): { count: number; used: Set<string> } => {
    let remainingFreezes = Math.max(0, streakFreezeTokens - used.size);
    const nextUsed = new Set<string>();
    let count = 0;

    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    while (true) {
      const dateStr = toLocalDateString(cursor);
      const dayOfWeek = getDayOfWeek(cursor);
      const isToday = dateStr === todayStr;

      if (sessionDays.has(dateStr)) {
        count++;
      } else if (isToday) {
        // Grace period for today (or today is a rest day) — do not penalize
      } else if (restDaySet.has(dayOfWeek)) {
        // Configured rest day — exempt from breaking streak
      } else if (used.has(dateStr)) {
        // Already covered by a previously spent freeze token
        nextUsed.add(dateStr);
      } else if (remainingFreezes > 0) {
        remainingFreezes--;
        nextUsed.add(dateStr);
      } else {
        // Uncovered gap — streak ends
        break;
      }

      if (dateStr <= oldestSessionStr) break;

      cursor.setDate(cursor.getDate() - 1);

      // Safety brake for historical walk (maximum 10 years)
      if (count > 3650) break;
    }

    // A walk that never reached a session day protects nothing — refund any
    // freezes spent on the way to the gap.
    if (count === 0) nextUsed.clear();

    return { count, used: nextUsed };
  };

  let used = new Set(previousStreak.freezeUsedOn ?? []);
  let result = walk(used);
  const maxPasses = Math.max(2, streakFreezeTokens + 2);
  for (let pass = 0; pass < maxPasses; pass++) {
    const stable =
      result.used.size === used.size && [...result.used].every((d) => used.has(d));
    if (stable) break;
    used = result.used;
    result = walk(used);
  }

  const longest = Math.max(previousStreak.longestStreakDays, result.count);
  const crossed = isNewMilestone(result.count, previousStreak.currentStreakDays);
  const milestonesAchieved = crossed
    ? [...previousStreak.milestonesAchieved, crossed]
    : previousStreak.milestonesAchieved;

  return {
    id: 'singleton',
    currentStreakDays: result.count,
    longestStreakDays: longest,
    lastSessionDate: todayStr,
    milestonesAchieved,
    freezeUsedOn: [...result.used],
    updatedAt: now,
  };
}
