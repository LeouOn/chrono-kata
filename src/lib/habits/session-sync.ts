import type { Session } from '@/lib/schemas/session';
import type { Habit } from '@/lib/schemas/habit';
import { habitRepo } from '@/lib/db/habit.repo';
import { habitLogRepo } from '@/lib/db/habit-log.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { toLocalDateString } from '@/lib/utils/date';
import { labelMatches } from './schedule';

function habitMatchesSession(habit: Habit, session: Session): boolean {
  if (habit.linkedKataTemplateId && session.kataTemplateId) {
    return habit.linkedKataTemplateId === session.kataTemplateId;
  }
  return labelMatches(habit.linkedActivityLabel, session.activityLabel);
}

function habitsLinkedTo(habits: Habit[], session: Session): Habit[] {
  return habits.filter((habit) => habitMatchesSession(habit, session));
}

function sessionContributes(habit: Habit, session: Session): boolean {
  if (!habitMatchesSession(habit, session)) return false;
  if (habit.kind === 'count') return false;
  if (habit.kind === 'timed') return session.durationMinutes != null;
  return true;
}

/**
 * Fire-and-forget: create/update the session-derived habit log for a saved
 * session. Idempotent per (habit, session) — repeated calls never duplicate.
 */
export async function syncHabitLogsForSession(session: Session): Promise<void> {
  const habits = await habitRepo.getAll();
  for (const habit of habitsLinkedTo(habits, session)) {
    if (!sessionContributes(habit, session)) continue;
    await habitLogRepo.upsertForSession({
      habitId: habit.id,
      date: toLocalDateString(session.startedAt),
      minutes: habit.kind === 'timed' ? session.durationMinutes : null,
      delta: null,
      source: 'session',
      sessionId: session.id,
    });
  }
}

/** Remove a deleted session's derived habit logs. */
export async function removeHabitLogsForSession(sessionId: string): Promise<void> {
  await habitLogRepo.deleteBySessionId(sessionId);
}

/** Regenerate a single habit's session-derived logs from full history (on create/edit of the link). */
export async function backfillHabitLogsForHabit(habit: Habit): Promise<void> {
  if (habit.kind === 'count' || (!habit.linkedActivityLabel && !habit.linkedKataTemplateId)) return;
  const sessions = await sessionRepo.getAll();
  await habitLogRepo.deleteSessionSourcedForHabit(habit.id);
  for (const session of sessions) {
    if (!sessionContributes(habit, session)) continue;
    await habitLogRepo.upsertForSession({
      habitId: habit.id,
      date: toLocalDateString(session.startedAt),
      minutes: habit.kind === 'timed' ? session.durationMinutes : null,
      delta: null,
      source: 'session',
      sessionId: session.id,
    });
  }
}

/**
 * Deterministic full rebuild of every session-derived habit log from the
 * current sessions × habits. Used after data import so restored or replaced
 * sessions can never leave stale or duplicated derived entries.
 */
export async function rebuildSessionHabitLogs(): Promise<void> {
  const [habits, sessions] = await Promise.all([habitRepo.getAll(), sessionRepo.getAll()]);
  await habitLogRepo.deleteAllSessionSourced();
  for (const habit of habits) {
    for (const session of sessions) {
      if (!sessionContributes(habit, session)) continue;
      await habitLogRepo.upsertForSession({
        habitId: habit.id,
        date: toLocalDateString(session.startedAt),
        minutes: habit.kind === 'timed' ? session.durationMinutes : null,
        delta: null,
        source: 'session',
        sessionId: session.id,
      });
    }
  }
}
