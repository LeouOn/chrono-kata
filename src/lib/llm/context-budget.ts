/**
 * Context budget for small-context local models (roadmap W5).
 *
 * The token estimate is deliberately conservative and cheap: **one token is
 * about four characters**. Real tokenizers differ, so this over-estimates
 * slightly rather than blowing the budget. Everything here is pure so it can
 * be unit-tested without a model.
 */

export const CHARS_PER_TOKEN = 4;

/** Conservative token estimate for a piece of text. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface BudgetFit<T> {
  /** The items that fit, in the order they were given. */
  kept: T[];
  /** How many items did not fit. */
  dropped: number;
  /** The estimated tokens of the kept items. */
  tokens: number;
  /** True when at least one item was dropped. */
  truncated: boolean;
}

/**
 * Keep as many whole items as fit in the budget.
 *
 * Items are never cut in half: a half session or a half task is worse than no
 * session at all, so an item that does not fit is dropped and counted.
 */
export function fitToBudget<T>(
  items: readonly T[],
  render: (item: T) => string,
  budgetTokens: number,
): BudgetFit<T> {
  const kept: T[] = [];
  let tokens = 0;
  let dropped = 0;

  if (budgetTokens <= 0) {
    return { kept, dropped: items.length, tokens: 0, truncated: items.length > 0 };
  }

  for (const item of items) {
    const cost = estimateTokens(render(item));
    if (tokens + cost > budgetTokens) {
      dropped += 1;
      continue;
    }
    kept.push(item);
    tokens += cost;
  }

  return { kept, dropped, tokens, truncated: dropped > 0 };
}

/**
 * Cut a single piece of text down to a token budget.
 *
 * Used when one item is too big on its own and a shortened version is still
 * useful (for example a very long session note).
 */
export function truncateToBudget(text: string, budgetTokens: number): string {
  if (budgetTokens <= 0) return '';
  const limit = budgetTokens * CHARS_PER_TOKEN;
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}
