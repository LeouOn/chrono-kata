import type { Session } from '@/lib/schemas/session';
import type { KataTemplate } from '@/lib/schemas/kata-template';

export const LABEL_SUGGESTION_LIMIT = 6;

/**
 * Recent-label suggestions for the session form.
 * Sessions contribute newest-first; template labels follow. Case-insensitive
 * dedupe; the current input value is excluded; result is capped.
 */
export function buildLabelSuggestions(
  sessions: Session[],
  templates: KataTemplate[],
  current: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const currentKey = current.trim().toLowerCase();

  const push = (raw: string | undefined): void => {
    if (!raw) return;
    const label = raw.trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (key === currentKey || seen.has(key)) return;
    seen.add(key);
    result.push(label);
  };

  const newestFirst = [...sessions].sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
  );
  for (const s of newestFirst) push(s.activityLabel);
  for (const t of templates) push(t.activityLabel);

  return result.slice(0, LABEL_SUGGESTION_LIMIT);
}
