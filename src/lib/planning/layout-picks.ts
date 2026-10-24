/**
 * Which picks a layout may place. A confirmed day plan is the user's choice and
 * wins, in its order; with no plan the ranker's suggestions are a proposal.
 * Only tasks still open (`next`) are laid out — a task completed elsewhere
 * meanwhile must not be resurrected by a stale preview.
 */
export function layoutPickIds(input: {
  dayPlanPicks: readonly string[] | null | undefined;
  suggestedIds: readonly string[];
  statusById: ReadonlyMap<string, string>;
}): string[] {
  const source = input.dayPlanPicks ?? input.suggestedIds;
  return source.filter((id) => input.statusById.get(id) === 'next');
}
