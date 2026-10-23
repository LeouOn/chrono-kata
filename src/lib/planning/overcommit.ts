/**
 * Overcommit check (roadmap Wave 6).
 *
 * Tells the user, plainly and without blame, when the picks they confirmed do
 * not fit the day they have.
 */

export interface PickEstimate {
  readonly estimateMin?: number | null;
}

/**
 * The estimate used for a pick that has none.
 *
 * The roadmap's own rule is that the app should nudge towards the smallest
 * startable action, so a pick without an estimate is counted as 25 minutes —
 * the size of a normal practice block, and a deliberately modest number.
 */
export const DEFAULT_PICK_MINUTES = 25;

export interface OvercommitResult {
  /** Minutes the picks add up to. */
  readonly totalMin: number;
  /** Minutes the day has. */
  readonly capacityMin: number;
  /** True when the picks do not fit. */
  readonly over: boolean;
  /** A sentence for the user. Never blames anyone. */
  readonly message: string;
}

/**
 * Compare the picks with the day's capacity.
 *
 * The message is deliberately neutral: it says what does not fit and that
 * something can wait. It never counts what was missed.
 */
export function checkOvercommit(
  picks: readonly PickEstimate[],
  capacityMin: number,
  defaultMinutes: number = DEFAULT_PICK_MINUTES,
): OvercommitResult {
  const totalMin = picks.reduce(
    (sum, pick) => sum + (pick.estimateMin != null ? pick.estimateMin : defaultMinutes),
    0,
  );
  const over = totalMin > capacityMin;

  if (!over) {
    return {
      totalMin,
      capacityMin,
      over,
      message:
        capacityMin === 0
          ? `These add up to ${totalMin} minutes. There is no room left in the day today, so they would have to wait.`
          : `These add up to ${totalMin} minutes, inside the ${capacityMin} you have today.`,
    };
  }

  const overBy = totalMin - capacityMin;
  return {
    totalMin,
    capacityMin,
    over,
    message:
      capacityMin === 0
        ? `These add up to ${totalMin} minutes and there is no room left in the day today. Something can wait.`
        : `These add up to ${totalMin} minutes, ${overBy} more than the ${capacityMin} you have today. Something can wait.`,
  };
}
