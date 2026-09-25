import { habitLogRepo } from '@/lib/db/habit-log.repo';

const KEY = 'chrono-kata-habit-timer';

export interface HabitTimerState {
  habitId: string;
  date: string;
  /** Milliseconds not yet written to a log. */
  accumulatedMs: number;
  /** Set while the clock is running. */
  runningSinceMs: number | null;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeHabitTimer(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readHabitTimer(): HabitTimerState | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HabitTimerState;
    if (!parsed.habitId || !parsed.date) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeHabitTimer(state: HabitTimerState | null) {
  if (typeof localStorage === 'undefined') return;
  if (state == null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(state));
  emit();
}

/** Write unsaved running time into a manual log and clear the clock. */
export async function pauseHabitTimer(): Promise<void> {
  const current = readHabitTimer();
  if (!current) return;
  const elapsed =
    current.accumulatedMs +
    (current.runningSinceMs == null ? 0 : Math.max(0, Date.now() - current.runningSinceMs));
  writeHabitTimer(null);
  if (elapsed >= 500) {
    const minutes = Math.round((elapsed / 60_000) * 1000) / 1000;
    if (minutes > 0) {
      await habitLogRepo.add({
        habitId: current.habitId,
        date: current.date,
        minutes,
        delta: null,
        source: 'manual',
      });
    }
  }
}

export function startHabitTimer(habitId: string, date: string) {
  writeHabitTimer({
    habitId,
    date,
    accumulatedMs: 0,
    runningSinceMs: Date.now(),
  });
}

export function habitTimerElapsed(state: HabitTimerState | null, now = Date.now()): number {
  if (!state) return 0;
  if (state.runningSinceMs == null) return state.accumulatedMs;
  return state.accumulatedMs + Math.max(0, now - state.runningSinceMs);
}
