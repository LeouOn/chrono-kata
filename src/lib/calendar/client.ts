import { getValidAccessToken } from './token-store';
import type { GoogleCalendarEvent } from './types';

const API_BASE = 'https://www.googleapis.com/calendar/v3';

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Not authenticated with Google.');
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Create a dedicated calendar named "chrono-kata" on the user's account.
 * Returns the new calendar's ID.
 */
export async function createChronoKataCalendar(): Promise<string> {
  const resp = await authedFetch('/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: 'chrono-kata' }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to create calendar: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as { id: string };
  return data.id;
}

/**
 * Delete the chrono-kata calendar. Use during disconnect-with-wipe.
 */
export async function deleteCalendar(calendarId: string): Promise<void> {
  const resp = await authedFetch(`/calendars/${encodeURIComponent(calendarId)}`, {
    method: 'DELETE',
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Failed to delete calendar: ${resp.status}`);
  }
}

/** Create a calendar event. Returns the new event's ID. */
export async function createEvent(calendarId: string, event: GoogleCalendarEvent): Promise<string> {
  const resp = await authedFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(event),
  });
  if (!resp.ok) {
    throw new Error(`Failed to create event: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as { id: string };
  return data.id;
}

/** Update a calendar event. */
export async function updateEvent(
  calendarId: string,
  eventId: string,
  event: GoogleCalendarEvent
): Promise<void> {
  const resp = await authedFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PUT', body: JSON.stringify(event) }
  );
  if (!resp.ok) {
    throw new Error(`Failed to update event: ${resp.status}`);
  }
}

/** Delete a calendar event. */
export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  const resp = await authedFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' }
  );
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Failed to delete event: ${resp.status}`);
  }
}
