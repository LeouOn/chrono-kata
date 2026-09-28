/**
 * Lagged response analysis: how load on one day maps to wellbeing `lag`
 * days later, plus the safe-load envelope estimated from that relationship.
 *
 * Tuning constants (documented decisions):
 * - Envelope needs >= 14 pairs; anything less reports insufficient data.
 * - A candidate threshold qualifies when the mean wellbeing above it drops
 *   by >= 0.1 versus the mean below it, with >= 3 observations above it;
 *   the envelope is the qualifying threshold with the maximum drop.
 * - Confidence is 'medium' at n >= 30 observations, otherwise 'low'.
 */

import type { CheckIn } from '@/lib/schemas/check-in';
import { addDays } from './days';
import { WELLBEING_WEIGHTS } from './types';
import type { CorrelationResult, EnvelopeResult, LaggedPair, LoadMap, WellbeingWeights } from './types';

/** Map a 1-5 scale where high is good (energy, sleep) onto 0-1. */
function scaleUp(value: number): number {
  return (value - 1) / 4;
}

/** Map a 1-5 scale where high is bad (fog, aches) onto 0-1, inverted. */
function scaleDown(value: number): number {
  return (5 - value) / 4;
}

/**
 * Normalize a check-in to a single 0-1 wellbeing score: energy and sleep
 * score directly, fog and aches inverted, combined by weighted sum.
 */
export function wellbeing(checkIn: CheckIn, weights: WellbeingWeights = WELLBEING_WEIGHTS): number {
  return (
    weights.energy * scaleUp(checkIn.energy) +
    weights.sleep * scaleUp(checkIn.sleep) +
    weights.fog * scaleDown(checkIn.fog) +
    weights.aches * scaleDown(checkIn.aches)
  );
}

/**
 * Pairs of [load on day N, wellbeing on day N+lag], one per check-in.
 * Days without sessions count as load 0; days without a check-in are
 * skipped because there is no response to observe.
 */
export function laggedPairs(daily: LoadMap, checkIns: readonly CheckIn[], lag: 1 | 2): LaggedPair[] {
  return checkIns.map((checkIn) => [
    daily.get(addDays(checkIn.date, -lag)) ?? 0,
    wellbeing(checkIn),
  ] as const);
}

/** Pearson r over [x, y] pairs; null when n < 2 or either variable is constant. */
function pearsonOnPairs(pairs: readonly LaggedPair[]): number | null {
  const n = pairs.length;
  if (n < 2) return null;
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX === 0 || varianceY === 0) return null;
  return covariance / Math.sqrt(varianceX * varianceY);
}

/** Map each distinct value to its average rank (ties share the mean rank). */
function averageRankByValue(values: readonly number[]): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const ranks = new Map<number, number>();
  let nextRank = 1;
  for (const value of [...counts.keys()].sort((a, b) => a - b)) {
    const count = counts.get(value) ?? 0;
    ranks.set(value, nextRank + (count - 1) / 2);
    nextRank += count;
  }
  return ranks;
}

function rankedPairs(pairs: readonly LaggedPair[]): LaggedPair[] {
  const xRanks = averageRankByValue(pairs.map(([x]) => x));
  const yRanks = averageRankByValue(pairs.map(([, y]) => y));
  return pairs.map(([x, y]) => [xRanks.get(x) ?? x, yRanks.get(y) ?? y] as const);
}

/** Spearman (rank) and Pearson correlations over the lagged pairs. */
export function correlation(pairs: readonly LaggedPair[]): CorrelationResult {
  return {
    n: pairs.length,
    pearson: pearsonOnPairs(pairs),
    spearman: pairs.length < 2 ? null : pearsonOnPairs(rankedPairs(pairs)),
  };
}

const MIN_PAIRS = 14;
const DROP_THRESHOLD = 0.1;
const DROP_FLOAT_EPSILON = 1e-9;
const MIN_ABOVE_BUCKET = 3;
const MEDIUM_CONFIDENCE_N = 30;

/**
 * Estimate the safe-load envelope with a max-drop (knee) scan.
 *
 * For each candidate threshold (every distinct observed load, ascending)
 * with at least MIN_ABOVE_BUCKET pairs strictly above it, compute how much
 * mean next-day wellbeing drops above versus below the threshold, and
 * select the threshold with the MAXIMUM drop (ties resolve to the lower
 * threshold). A threshold qualifies only when its drop reaches the drop
 * threshold (with a float epsilon, so a true drop of exactly 0.1 counts).
 *
 * Why argmax and not first/last qualifying threshold: the lowest-qualifying
 * threshold suffers a pooled-bucket artifact — its above-bucket pools every
 * higher load, so mild degradation from mid loads already "drops" against
 * the pristine low-load bucket and can return a spuriously tiny envelope.
 * The largest-qualifying threshold errs in the unsafe direction, drifting
 * toward whatever high load still shows any drop. The maximum drop is the
 * knee of the dose-response curve: the sharpest transition from tolerated
 * to harmful load.
 *
 * When no threshold's drop reaches the threshold, every observed load was
 * tolerated, so the max observed load is the envelope.
 */
export function estimateEnvelope(pairs: readonly LaggedPair[]): EnvelopeResult {
  const n = pairs.length;
  if (n < MIN_PAIRS) return { insufficientData: true };
  const confidence = n >= MEDIUM_CONFIDENCE_N ? ('medium' as const) : ('low' as const);

  const loads = [...new Set(pairs.map(([load]) => load))].sort((a, b) => a - b);
  let envelope: number | undefined;
  let bestDrop = DROP_THRESHOLD - DROP_FLOAT_EPSILON;
  for (const threshold of loads) {
    let belowSum = 0;
    let belowCount = 0;
    let aboveSum = 0;
    let aboveCount = 0;
    for (const [load, response] of pairs) {
      if (load > threshold) {
        aboveSum += response;
        aboveCount += 1;
      } else {
        belowSum += response;
        belowCount += 1;
      }
    }
    if (aboveCount < MIN_ABOVE_BUCKET) continue;
    const drop = belowSum / belowCount - aboveSum / aboveCount;
    // Strict comparison keeps the lower threshold on ties (loads ascend).
    if (drop > bestDrop) {
      bestDrop = drop;
      envelope = threshold;
    }
  }

  if (envelope === undefined) {
    const maxLoad = loads.reduce((max, load) => Math.max(max, load));
    return { envelope: maxLoad, n, confidence };
  }
  return { envelope, n, confidence };
}
