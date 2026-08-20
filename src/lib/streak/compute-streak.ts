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
 *    - Else if streak freeze available: consumes 1 freeze and continues walk.
 *    - Else: streak gap reached, terminates walk.
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
      updatedAt: now,
    };
  }

  // Set of local YYYY-MM-DD strings that have at least one session.
  const sessionDays = new Set(sessions.map((s) => toLocalDateString(s.startedAt)));
  const restDaySet = new Set<DayOfWeek>(restDays);

  const todayStr = toLocalDateString(now);
  let availableFreezes = streakFreezeTokens;
  let count = 0;

  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  while (true) {
    const dateStr = toLocalDateString(cursor);
    const dayOfWeek = getDayOfWeek(cursor);
    const isToday = dateStr === todayStr;

    if (sessionDays.has(dateStr)) {
      count++;
    } else {
      if (isToday) {
        // Grace period for today (or today is a rest day) — do not penalize
      } else if (restDaySet.has(dayOfWeek)) {
        // Configured rest day — exempt from breaking streak
      } else if (availableFreezes > 0) {
        // Unplanned missed day covered by Streak Freeze token
        availableFreezes--;
      } else {
        // Uncovered gap — streak ends
        break;
      }
    }

    cursor.setDate(cursor.getDate() - 1);

    // Safety brake for historical walk (maximum 10 years)
    if (count > 3650) break;
  }

  const longest = Math.max(previousStreak.longestStreakDays, count);
  const crossed = isNewMilestone(count, previousStreak.currentStreakDays);
  const milestonesAchieved = crossed
    ? [...previousStreak.milestonesAchieved, crossed]
    : previousStreak.milestonesAchieved;

  return {
    id: 'singleton',
    currentStreakDays: count,
    longestStreakDays: longest,
    lastSessionDate: todayStr,
    milestonesAchieved,
    updatedAt: now,
  };
}
