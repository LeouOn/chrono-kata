import type { Session } from '@/lib/schemas/session';
import type { Settings } from '@/lib/schemas/settings';
import type { GoogleCalendarEvent } from './types';
import { createEvent, updateEvent, deleteEvent } from './client';
import { pendingCalendarOpsRepo } from '@/lib/db/pending-calendar-ops.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { settingsRepo } from '@/lib/db/settings.repo';

/** Returns true if this session should be pushed to Google Calendar. */
export function shouldSyncSession(session: Session, settings: Settings): boolean {
  if (!settings.googleCalendarSyncEnabled) return false;
  if (!settings.googleCalendarId) return false;
  if (session.durationMinutes == null) return false; // reps-only: no time window
  return true;
}

/** Build the Google Calendar event body from a session. */
export function buildEventFromSession(session: Session): GoogleCalendarEvent {
  if (session.durationMinutes == null) {
    throw new Error('Cannot build event from reps-only session');
  }
  const start = session.startedAt;
  const end = new Date(start.getTime() + session.durationMinutes * 60_000);
  return {
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    summary: session.activityLabel ?? 'chrono-kata session',
    description: session.note ?? '',
  };
}

/**
 * Fire-and-forget: try to create/update the calendar event for a session.
 * On any failure, enqueue into pendingCalendarOps for retry.
 */
export async function syncSessionCreateOrUpdate(session: Session): Promise<void> {
  const settings = await settingsRepo.get();
  if (!shouldSyncSession(session, settings)) return;

  const calendarId = settings.googleCalendarId!;

  try {
    if (session.calendarEventId) {
      await updateEvent(calendarId, session.calendarEventId, buildEventFromSession(session));
    } else {
      const eventId = await createEvent(calendarId, buildEventFromSession(session));
      await sessionRepo.update(session.id, { calendarEventId: eventId });
    }
  } catch (e) {
    await pendingCalendarOpsRepo.enqueue({
      op: session.calendarEventId ? 'update' : 'create',
      sessionId: session.id,
      payload: buildEventFromSession(session) as unknown as Record<string, unknown>,
    });
    console.warn('Calendar sync failed, op queued:', e);
  }
}

/**
 * Fire-and-forget: delete the calendar event for a deleted session.
 */
export async function syncSessionDelete(session: Session): Promise<void> {
  const settings = await settingsRepo.get();
  if (!session.calendarEventId) return;
  if (!settings.googleCalendarId) return;

  try {
    await deleteEvent(settings.googleCalendarId, session.calendarEventId);
  } catch (e) {
    await pendingCalendarOpsRepo.enqueue({
      op: 'delete',
      sessionId: session.id,
    });
    console.warn('Calendar delete sync failed, op queued:', e);
  }
}

/**
 * Flush pending ops with exponential backoff per op. Called on app open
 * and on each subsequent session save. Permanently-failed ops (5 attempts)
 * are surfaced in Settings for manual retry or discard.
 */
export async function flushPendingOps(): Promise<void> {
  const settings = await settingsRepo.get();
  if (!settings.googleCalendarId) return;

  const ops = await pendingCalendarOpsRepo.getAll();
  for (const op of ops) {
    if (op.attempts >= 5) continue;

    try {
      const session = await sessionRepo.getById(op.sessionId);
      if (op.op === 'delete') {
        if (session?.calendarEventId) {
          await deleteEvent(settings.googleCalendarId!, session.calendarEventId);
        }
      } else if (session) {
        const eventPayload = op.payload as unknown as GoogleCalendarEvent | undefined;
        if (!eventPayload) continue;
        if (op.op === 'create') {
          const eventId = await createEvent(settings.googleCalendarId!, eventPayload);
          await sessionRepo.update(session.id, { calendarEventId: eventId });
        } else {
          if (session.calendarEventId) {
            await updateEvent(settings.googleCalendarId!, session.calendarEventId, eventPayload);
          }
        }
      }
      await pendingCalendarOpsRepo.delete(op.id);
    } catch (e) {
      const lastError = e instanceof Error ? e.message : String(e);
      await pendingCalendarOpsRepo.update(op.id, {
        attempts: op.attempts + 1,
        lastError,
      });
    }
  }
}
