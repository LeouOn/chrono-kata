const KEY = 'chrono-kata-session-timer';

export interface SessionTimerDraft {
  startedAtMs: number;
  mode: 'timed' | 'reps';
  durationMinutes: number | null;
  reps: number | null;
  activityLabel: string;
  note: string;
  templateId: string | null;
  softCapMinutes: number | null;
  capPromptShown: boolean;
  keepGoing: boolean;
}

export function readSessionTimer(): SessionTimerDraft | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionTimerDraft>;
    if (typeof parsed.startedAtMs !== 'number' || !Number.isFinite(parsed.startedAtMs)) return null;
    if (parsed.mode !== 'timed' && parsed.mode !== 'reps') return null;
    return {
      startedAtMs: parsed.startedAtMs,
      mode: parsed.mode,
      durationMinutes: parsed.durationMinutes ?? null,
      reps: parsed.reps ?? null,
      activityLabel: parsed.activityLabel ?? '',
      note: parsed.note ?? '',
      templateId: parsed.templateId ?? null,
      softCapMinutes: parsed.softCapMinutes ?? null,
      capPromptShown: parsed.capPromptShown === true,
      keepGoing: parsed.keepGoing === true,
    };
  } catch {
    return null;
  }
}

export function writeSessionTimer(draft: SessionTimerDraft | null) {
  if (typeof localStorage === 'undefined') return;
  if (draft == null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(draft));
}

/** True when the user stops within a minute of a cap prompt that was shown. */
export function stoppedAtCap(args: {
  softCapMinutes: number | null | undefined;
  elapsedMinutes: number | null | undefined;
  promptShown: boolean;
}): boolean {
  if (!args.promptShown || args.softCapMinutes == null || args.elapsedMinutes == null) return false;
  return Math.abs(args.elapsedMinutes - args.softCapMinutes) <= 1;
}
