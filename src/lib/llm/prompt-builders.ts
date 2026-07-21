import type { Session } from '@/lib/schemas/session';
import { formatDuration } from '@/lib/utils/format';
import { toLocalDateString } from '@/lib/utils/date';

/**
 * Compact single-session summary for inclusion in LLM context.
 * Targets ~40 tokens per session. Format:
 *   YYYY-MM-DD | activityLabel | duration | rating
 *   | note (truncated to 30 chars)
 */
export function buildSessionContextSummary(s: Session): string {
  const parts: string[] = [toLocalDateString(s.startedAt)];
  if (s.activityLabel) parts.push(s.activityLabel);
  if (s.durationMinutes != null) parts.push(formatDuration(s.durationMinutes));
  else if (s.reps != null) parts.push(`${s.reps} reps`);
  parts.push(`${s.rating}/5`);
  const line = parts.join(' | ');
  if (s.note) {
    const note = s.note.length > 30 ? s.note.slice(0, 30) + '…' : s.note;
    return `${line} | ${note}`;
  }
  return line;
}

/**
 * Build the user-side text for a coach-comment generation call.
 * Includes current session + last 5 sessions (token-budgeted).
 */
export function buildCoachUserText(current: Session, recent: Session[]): string {
  const lines: string[] = [];
  lines.push('Current session:');
  lines.push(buildSessionContextSummary(current));
  if (recent.length > 0) {
    lines.push('');
    lines.push('Recent sessions (most recent first):');
    for (const r of recent.slice(0, 5)) {
      lines.push(buildSessionContextSummary(r));
    }
  }
  lines.push('');
  lines.push('Respond with a 2-4 sentence reflection. No flattery. Address me by name if relevant. Match the personality.');
  return lines.join('\n');
}

/**
 * Build the user-side text for a weekly reflection.
 * Includes summary stats + session list.
 */
export function buildWeeklyReflectionUserText(sessions: Session[]): string {
  const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
  const totalReps = sessions.reduce((sum, s) => sum + (s.reps ?? 0), 0);
  const avgRating =
    sessions.length > 0
      ? (sessions.reduce((sum, s) => sum + s.rating, 0) / sessions.length).toFixed(2)
      : 'n/a';

  const lines: string[] = [
    `Total sessions: ${sessions.length}`,
    `Total time: ${formatDuration(totalMinutes)}`,
    `Total reps: ${totalReps}`,
    `Average rating: ${avgRating}`,
    '',
    'Sessions (oldest first):',
  ];
  for (const s of [...sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    lines.push(buildSessionContextSummary(s));
  }
  lines.push('');
  lines.push('Respond with 2-3 observations about patterns you notice, followed by ONE specific question for me to sit with next week. Format as JSON: { "observations": ["...","..."], "question": "..." }');
  return lines.join('\n');
}
