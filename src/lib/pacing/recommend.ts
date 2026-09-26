/**
 * The pacing decision: rest, reduce, hold, or build today's load.
 *
 * Rules decide; the coach (T5) only phrases. First match wins.
 *
 * | # | Condition                                                                                   | Action                          |
 * |---|----------------------------------------------------------------------------------------------|---------------------------------|
 * | 0 | No check-in today                                                                            | hold — "no check-in yet"        |
 * | 1 | Today's energy <= 2, or energy dropped >= 2 points below the mean energy of the prior 3 days  | rest, targetLoad 0              |
 * | 2 | Yesterday's load > envelope, or wellbeing strictly decreased over the 3 days ending yesterday | reduce 20% of yesterday's load  |
 * | 3 | Wellbeing >= 0.7 for the 5 consecutive days ending today, 7-day mean load <= 80% of envelope, | build +10% of the 7-day mean    |
 * |   | and today's energy >= 4                                                                      |                                 |
 * | 4 | Otherwise                                                                                    | hold                            |
 *
 * Clarifications of the spec (documented decisions):
 * - "Prior 3 days" = today-1..today-3; the mean skips missing check-ins and
 *   needs at least one of them to exist.
 * - "Trending down" = wellbeing strictly decreasing across today-3, today-2,
 *   today-1, all three check-ins present.
 * - The 7-day mean load covers today-7..today-1 (today is not over yet) and
 *   counts missing days as zero load.
 * - Invariants (property-tested): never `build` when today's energy <= 3, and
 *   never `build` without a check-in today (rule 0 returns first).
 */

import type { CheckIn } from '@/lib/schemas/check-in';
import { addDays } from './days';
import { rollingLoad } from './load';
import { wellbeing } from './response';
import type { LoadMap, RecommendInput, Recommendation } from './types';

const REST_ENERGY_FLOOR = 2;
const ENERGY_DROP_POINTS = 2;
const PRIOR_DAYS = 3;
const REDUCE_PCT = 20;
const BUILD_PCT = 10;
const BUILD_WELLBEING_FLOOR = 0.7;
const BUILD_STREAK_DAYS = 5;
const BUILD_ENVELOPE_SHARE = 0.8;
const BASE_WINDOW_DAYS = 7;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function wellbeingOn(byDay: ReadonlyMap<string, CheckIn>, dayKey: string): number | undefined {
  const checkIn = byDay.get(dayKey);
  return checkIn === undefined ? undefined : wellbeing(checkIn);
}

function priorEnergyBasis(byDay: ReadonlyMap<string, CheckIn>, today: string): { readonly mean: number; readonly days: number } | undefined {
  const energies: number[] = [];
  for (let offset = 1; offset <= PRIOR_DAYS; offset++) {
    const checkIn = byDay.get(addDays(today, -offset));
    if (checkIn !== undefined) energies.push(checkIn.energy);
  }
  if (energies.length === 0) return undefined;
  return {
    mean: energies.reduce((sum, value) => sum + value, 0) / energies.length,
    days: energies.length,
  };
}

function trendingDown(byDay: ReadonlyMap<string, CheckIn>, today: string): boolean {
  const w1 = wellbeingOn(byDay, addDays(today, -1));
  const w2 = wellbeingOn(byDay, addDays(today, -2));
  const w3 = wellbeingOn(byDay, addDays(today, -3));
  if (w1 === undefined || w2 === undefined || w3 === undefined) return false;
  return w3 > w2 && w2 > w1;
}

function hasBuildStreak(byDay: ReadonlyMap<string, CheckIn>, today: string): boolean {
  for (let offset = 0; offset < BUILD_STREAK_DAYS; offset++) {
    const score = wellbeingOn(byDay, addDays(today, -offset));
    if (score === undefined || score < BUILD_WELLBEING_FLOOR) return false;
  }
  return true;
}

/** Deterministic pacing recommendation for today. Pure: `today` comes from the caller. */
export function recommend(input: RecommendInput): Recommendation {
  const { today, checkIns, dailyLoad, envelope } = input;
  const byDay = new Map(checkIns.map((checkIn) => [checkIn.date, checkIn] as const));

  const todayCheckIn = byDay.get(today);
  if (todayCheckIn === undefined) {
    return { action: 'hold', reasons: ['no check-in yet'] };
  }

  // Rule 1: rest.
  const lowEnergy = todayCheckIn.energy <= REST_ENERGY_FLOOR;
  const basis = priorEnergyBasis(byDay, today);
  const energyCrashed = basis !== undefined && todayCheckIn.energy <= basis.mean - ENERGY_DROP_POINTS;
  if (lowEnergy || energyCrashed) {
    const reasons: string[] = [];
    if (lowEnergy) {
      reasons.push(`today's energy (${todayCheckIn.energy}/5) is at or below the rest floor of ${REST_ENERGY_FLOOR}`);
    }
    if (energyCrashed && basis !== undefined) {
      reasons.push(
        `energy crashed to ${todayCheckIn.energy} (${round1(basis.mean)} average over ${basis.days} of ${PRIOR_DAYS} prior days)`
      );
    }
    return { action: 'rest', targetLoad: 0, reasons };
  }

  // Rule 2: reduce.
  const yesterday = addDays(today, -1);
  const yesterdayLoad = dailyLoad.get(yesterday) ?? 0;
  const overloaded = envelope !== undefined && yesterdayLoad > envelope;
  const downtrend = trendingDown(byDay, today);
  if (overloaded || downtrend) {
    const reasons: string[] = [];
    if (overloaded) {
      reasons.push(`yesterday's load (${round1(yesterdayLoad)}) exceeded the envelope (${round1(envelope ?? 0)})`);
    }
    if (downtrend) {
      reasons.push('wellbeing has trended down over the last 3 days');
    }
    return {
      action: 'reduce',
      pct: REDUCE_PCT,
      targetLoad: round1(yesterdayLoad * (1 - REDUCE_PCT / 100)),
      reasons,
    };
  }

  // Rule 3: build (guarded by the energy invariant).
  const baseLoad = rollingLoad(dailyLoad, yesterday, BASE_WINDOW_DAYS) / BASE_WINDOW_DAYS;
  const streakHolds = hasBuildStreak(byDay, today);
  const headroom = envelope !== undefined && baseLoad <= BUILD_ENVELOPE_SHARE * envelope;
  const energeticEnough = todayCheckIn.energy > 3;
  if (streakHolds && headroom && energeticEnough) {
    return {
      action: 'build',
      pct: BUILD_PCT,
      targetLoad: round1(baseLoad * (1 + BUILD_PCT / 100)),
      reasons: [
        `wellbeing held at or above ${BUILD_WELLBEING_FLOOR} for ${BUILD_STREAK_DAYS} days`,
        `recent load (${round1(baseLoad)}) is at or below 80% of the envelope (${round1(envelope ?? 0)})`,
      ],
    };
  }

  // Rule 4: hold.
  return { action: 'hold', reasons: ['no rest, reduce, or build trigger fired'] };
}
