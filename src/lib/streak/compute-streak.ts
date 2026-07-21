import type { Session } from '@/lib/schemas/session';
import type { Streak } from '@/lib/schemas/streak';
import { isNewMilestone } from './milestones';
import { toLocalDateString } from '@/lib/utils/date';

interface Args {
  sessions: Session[];
  previousStreak: Streak;
  now: Date;
}

/**
 * Compute the new streak state after a session save.
 *
 * The streak is ALIVE on day D iff the most recent session date ≤ D is either
 * D itself or D−1 (1-day grace window).
 *
 * Walk backwards from "today" (or "yesterday" if today has no session) and
 * count consecutive days with ≥1 session. Stop at the first gap.
 */
export function computeStreak({ sessions, previousStreak, now }: Args): Streak {
  if (sessions.length === 0) {
    return {
      ...previousStreak,
      updatedAt: now,
    };
  }

  // Set of local YYYY-MM-DD strings that have at least one session.
  const sessionDays = new Set(sessions.map((s) => toLocalDateString(s.startedAt)));

  const today = toLocalDateString(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = toLocalDateString(yesterdayDate);

  // Determine the "anchor" day: today if it has a session, else yesterday.
  let anchor: string;
  if (sessionDays.has(today)) {
    anchor = today;
  } else if (sessionDays.has(yesterday)) {
    anchor = yesterday;
  } else {
    // Streak is dead.
    return {
      ...previousStreak,
      currentStreakDays: 0,
      updatedAt: now,
    };
  }

  // Walk backwards from anchor counting consecutive days.
  let count = 0;
  const cursor = new Date(anchor + 'T00:00:00');
  while (true) {
    const key = toLocalDateString(cursor);
    if (!sessionDays.has(key)) break;
    count++;
    cursor.setDate(cursor.getDate() - 1);
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
    lastSessionDate: today,
    milestonesAchieved,
    updatedAt: now,
  };
}
