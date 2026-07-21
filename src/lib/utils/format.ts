import type { Session } from '@/lib/schemas/session';

export function formatDuration(minutes: number): string {
  if (minutes === 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatSessionSummary(s: Session): string {
  const parts: string[] = [];
  if (s.durationMinutes != null) {
    parts.push(formatDuration(s.durationMinutes));
  } else if (s.reps != null) {
    parts.push(`${s.reps} reps`);
  }
  if (s.activityLabel) {
    parts.push(s.activityLabel);
  }
  return parts.join(' · ');
}
