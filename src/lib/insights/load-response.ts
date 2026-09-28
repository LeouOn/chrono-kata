/**
 * Data processing and analysis helpers for the Load-Response insights view (T10a).
 *
 * Connects daily training load (T3 load.ts) with lagged next-day wellbeing (T3 response.ts),
 * timeline day formatting, envelope detection, and soft-cap adherence metrics.
 */

import { addDays } from '@/lib/pacing/days';
import { dailyLoad } from '@/lib/pacing/load';
import { correlation, estimateEnvelope, laggedPairs, wellbeing } from '@/lib/pacing/response';
import type { CorrelationResult, EnvelopeResult, LaggedPair, LoadMap } from '@/lib/pacing/types';
import type { CheckIn } from '@/lib/schemas/check-in';
import type { KataTemplate } from '@/lib/schemas/kata-template';
import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';

export interface TimelineDay {
  /** Local day key YYYY-MM-DD. */
  readonly date: string;
  /** Short label for chart axis, e.g. "Sep 15" or "09/15". */
  readonly label: string;
  /** Daily weighted training load-minutes on day N. */
  readonly load: number;
  /** Next-day wellbeing score (0.0 to 1.0) observed on day N+1, or null if no check-in. */
  readonly nextDayWellbeing: number | null;
  /** Energy rating (1-5) on day N, or null if no check-in on day N. */
  readonly energy: number | null;
  /** True when load on day N was 0. */
  readonly isRestDay: boolean;
  /** True when check-in on day N reported energy <= 2 (low-energy flare/day). */
  readonly isLowEnergyDay: boolean;
  /** True if day N has a recorded check-in. */
  readonly hasCheckIn: boolean;
  /** True if day N+1 has a recorded check-in. */
  readonly hasNextDayCheckIn: boolean;
}

export interface LoadResponseAnalysis {
  readonly timelineDays: readonly TimelineDay[];
  readonly pairs: readonly LaggedPair[];
  readonly correlation: CorrelationResult;
  readonly envelope: EnvelopeResult;
  readonly maxDailyLoad: number;
  readonly lag: 1 | 2;
  readonly stoppedAtCapMonthCount: number;
  readonly totalMonthSessions: number;
}

/** Format a YYYY-MM-DD string to a readable short date: "Sep 25" */
export function formatShortDate(dayKey: string): string {
  const parts = dayKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((p) => p === undefined || isNaN(p))) return dayKey;
  const [y, m, d] = parts;
  const date = new Date(y!, m! - 1, d!);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Build the timeline days for the load-response chart.
 * Generates an array of `daysCount` consecutive days ending at `endDate`.
 */
export function buildTimelineDays(
  sessions: readonly Session[],
  checkIns: readonly CheckIn[],
  templates: readonly KataTemplate[],
  daysCount = 30,
  endDate?: string
): TimelineDay[] {
  if (daysCount <= 0) return [];

  // Determine end date: caller provided > latest check-in or session > today
  let resolvedEnd = endDate;
  if (!resolvedEnd) {
    let latest = toLocalDateString(new Date());
    for (const c of checkIns) {
      if (c.date > latest) latest = c.date;
    }
    for (const s of sessions) {
      const d = toLocalDateString(s.startedAt);
      if (d > latest) latest = d;
    }
    resolvedEnd = latest;
  }

  const loadMap: LoadMap = dailyLoad(sessions, templates);
  const checkInMap = new Map<string, CheckIn>(checkIns.map((c) => [c.date, c]));

  const days: TimelineDay[] = [];
  for (let offset = daysCount - 1; offset >= 0; offset--) {
    const dayKey = addDays(resolvedEnd, -offset);
    const nextDayKey = addDays(dayKey, 1);

    const load = loadMap.get(dayKey) ?? 0;
    const checkInToday = checkInMap.get(dayKey);
    const checkInNextDay = checkInMap.get(nextDayKey);

    const energy = checkInToday ? checkInToday.energy : null;
    const nextDayWellbeing = checkInNextDay ? wellbeing(checkInNextDay) : null;

    days.push({
      date: dayKey,
      label: formatShortDate(dayKey),
      load,
      nextDayWellbeing,
      energy,
      isRestDay: load === 0,
      isLowEnergyDay: energy !== null && energy <= 2,
      hasCheckIn: checkInToday !== undefined,
      hasNextDayCheckIn: checkInNextDay !== undefined,
    });
  }

  return days;
}

/** Count sessions stopped at soft cap in the specified month (defaults to current month). */
export function countStoppedAtCapThisMonth(
  sessions: readonly Session[],
  now: Date = new Date()
): { count: number; total: number } {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let count = 0;
  let total = 0;

  for (const s of sessions) {
    const d = s.startedAt;
    if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
      total++;
      if (s.stoppedAtCap === true) {
        count++;
      }
    }
  }

  return { count, total };
}

/**
 * Returns a compassionate, plain-language description of the correlation coefficient.
 * Emphasizes that correlation does not mean causation.
 */
export function getCorrelationCaption(corr: CorrelationResult, lag: 1 | 2): string {
  if (corr.n < 2 || corr.spearman === null) {
    return 'Not enough paired observations yet to compute correlation.';
  }

  const lagWord = lag === 1 ? 'the next day' : '2 days later';
  const r = corr.spearman;

  if (r <= -0.4) {
    return `Inverse trend: Higher training load moderately precedes lower wellbeing ${lagWord} (r_s = ${r.toFixed(2)}).`;
  }
  if (r <= -0.15) {
    return `Mild inverse trend: Higher training load slightly precedes lower wellbeing ${lagWord} (r_s = ${r.toFixed(2)}).`;
  }
  if (r < 0.15) {
    return `Neutral relationship: Little to no direct link between training load and wellbeing ${lagWord} in this window (r_s = ${r.toFixed(2)}).`;
  }
  return `Positive trend: Activity was followed by steady or higher wellbeing ${lagWord} (r_s = ${r.toFixed(2)}).`;
}

/** Run the full load-response pipeline for display. */
export function analyzeLoadResponse(
  sessions: readonly Session[],
  checkIns: readonly CheckIn[],
  templates: readonly KataTemplate[],
  options: {
    daysCount?: number;
    endDate?: string;
    lag?: 1 | 2;
    now?: Date;
  } = {}
): LoadResponseAnalysis {
  const lag = options.lag ?? 1;
  const daysCount = options.daysCount ?? 30;
  const now = options.now ?? new Date();

  const daily = dailyLoad(sessions, templates);
  const pairs = laggedPairs(daily, checkIns, lag);
  const corr = correlation(pairs);
  const envelope = estimateEnvelope(pairs);

  const timelineDays = buildTimelineDays(sessions, checkIns, templates, daysCount, options.endDate);
  const maxDailyLoad = timelineDays.reduce((max, d) => Math.max(max, d.load), 0);
  const capMetrics = countStoppedAtCapThisMonth(sessions, now);

  return {
    timelineDays,
    pairs,
    correlation: corr,
    envelope,
    maxDailyLoad,
    lag,
    stoppedAtCapMonthCount: capMetrics.count,
    totalMonthSessions: capMetrics.total,
  };
}
