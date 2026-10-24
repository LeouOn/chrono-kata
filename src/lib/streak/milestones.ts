export const MILESTONES = [3, 7, 14, 30, 60, 90, 180, 365] as const;

/**
 * If `current` crossed a milestone that `previous` had not, return the highest
 * such milestone. Otherwise null. Capped at 365.
 */
export function isNewMilestone(current: number, previous: number): number | null {
  if (current <= previous) return null;
  let crossed: number | null = null;
  for (const m of MILESTONES) {
    if (previous < m && current >= m) {
      crossed = m;
    }
  }
  return crossed;
}

export function milestoneForDay(day: number): number | null {
  if (MILESTONES.includes(day as (typeof MILESTONES)[number])) {
    return day;
  }
  return null;
}

/**
 * Said by the session-save path when a save EARNED a new milestone, and by nothing else.
 *
 * The celebration used to compare the milestone list with what the screen last saw, so a streak that merely
 * ARRIVED (restoring a backup onto a new device, a first read, a recompute at app open) looked like an
 * achievement and threw confetti over whatever the person was doing. An event cannot be mistaken that way:
 * nobody says it unless a save just earned the milestone.
 */
export const MILESTONE_EVENT = 'chrono-kata-milestone';

export function announceMilestone(milestone: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<{ milestone: number }>(MILESTONE_EVENT, { detail: { milestone } }));
}
