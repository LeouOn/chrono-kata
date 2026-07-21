import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';

export interface ParsedTime {
  hours: number;
  minutes: number;
}

export function parseTimeString(s: string): ParsedTime | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function formatTimeString(t: ParsedTime): string {
  return `${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')}`;
}

interface ShouldFireArgs {
  reminderTime: string | null;
  notificationsEnabled: boolean;
  lastSessionDate: string | null; // YYYY-MM-DD local
  now: Date;
}

const WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export function shouldFireReminder({
  reminderTime,
  notificationsEnabled,
  lastSessionDate,
  now,
}: ShouldFireArgs): boolean {
  if (!reminderTime || !notificationsEnabled) return false;

  const parsed = parseTimeString(reminderTime);
  if (!parsed) return false;

  // Build today's reminder time as a Date.
  const todayKey = toLocalDateString(now);
  const reminderToday = new Date(now);
  reminderToday.setHours(parsed.hours, parsed.minutes, 0, 0);

  const diff = now.getTime() - reminderToday.getTime();
  if (diff < -WINDOW_MS || diff > WINDOW_MS) return false;

  // Skip if user already logged today.
  if (lastSessionDate === todayKey) return false;

  return true;
}

export function getLastLogDate(sessions: Session[], now: Date): string | null {
  if (sessions.length === 0) return null;
  let mostRecent: Date | null = null;
  for (const s of sessions) {
    if (mostRecent === null || s.startedAt.getTime() > mostRecent.getTime()) {
      mostRecent = s.startedAt;
    }
  }
  return mostRecent ? toLocalDateString(mostRecent) : null;
}
