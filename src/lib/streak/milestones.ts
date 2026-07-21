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
