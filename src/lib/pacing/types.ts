/**
 * Shared types and constants for the pacing engine (T3).
 *
 * This module is types + constants only, with no behavior, so T5
 * (rules-first coach) and T6 (recovery streaks) can code against it
 * without depending on the engine implementations.
 */

import type { CheckIn } from '@/lib/schemas/check-in';

/** Kata intensity: 1 = gentle, 2 = moderate, 3 = hard. Multiplies load. */
export type Intensity = 1 | 2 | 3;

/** Daily load: local YYYY-MM-DD day key -> weighted load-minutes. */
export type LoadMap = ReadonlyMap<string, number>;

/** Weights for the 0-1 wellbeing score; they sum to 1. */
export type WellbeingWeights = {
  readonly energy: number;
  readonly sleep: number;
  readonly fog: number;
  readonly aches: number;
};

/** Approved wellbeing weights: energy 0.4, sleep 0.2, fog 0.2, aches 0.2. */
export const WELLBEING_WEIGHTS = {
  energy: 0.4,
  sleep: 0.2,
  fog: 0.2,
  aches: 0.2,
} as const satisfies WellbeingWeights;

/** One load -> response observation: [load on day N, wellbeing on day N+lag]. */
export type LaggedPair = readonly [load: number, wellbeing: number];

/** Spearman + Pearson over the lagged pairs; null when undefined (n < 2 or zero variance). */
export type CorrelationResult = {
  readonly n: number;
  readonly spearman: number | null;
  readonly pearson: number | null;
};

/**
 * Estimated safe-load envelope: the load threshold above which mean
 * next-day wellbeing drops by at least the engine's drop threshold.
 */
export type EnvelopeResult =
  | { readonly insufficientData: true }
  | {
      readonly envelope: number;
      readonly n: number;
      readonly confidence: 'low' | 'medium';
    };

export type RecommendAction = 'rest' | 'reduce' | 'hold' | 'build';

export type Recommendation = {
  readonly action: RecommendAction;
  /** Percentage change, for reduce/build only. */
  readonly pct?: number;
  /** Load-minutes to aim for today, when an action implies one. */
  readonly targetLoad?: number;
  /** Short human-readable justifications, consumed by the T5 fallback text. */
  readonly reasons: readonly string[];
};

export type RecommendInput = {
  /** Local day key YYYY-MM-DD for "now" — always from the caller. */
  readonly today: string;
  readonly checkIns: readonly CheckIn[];
  readonly dailyLoad: LoadMap;
  /** Undefined when estimateEnvelope reports insufficient data. */
  readonly envelope: number | undefined;
};
