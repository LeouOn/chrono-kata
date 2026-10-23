import type { CheckIn } from '@/lib/schemas/check-in';
import type { KataTemplate } from '@/lib/schemas/kata-template';
import type { Session } from '@/lib/schemas/session';
import { addDays } from '@/lib/pacing/days';
import { dailyLoad, rollingLoad } from '@/lib/pacing/load';
import { recommend } from '@/lib/pacing/recommend';
import { estimateEnvelope, laggedPairs } from '@/lib/pacing/response';
import type { RecommendAction } from '@/lib/pacing/types';

export interface PacingCheckIn {
  date: string;
  energy: number;
  fog: number;
  aches: number;
  sleep: number;
}

export interface PacingSessionLine {
  label: string;
  minutes: number | null;
  rating: number;
}

export interface PacingContext {
  action: RecommendAction;
  pct?: number;
  reasons: string[];
  load7: number;
  previousLoad7: number;
  checkIns: PacingCheckIn[];
  streakDays: number;
  restDay: boolean;
  recentSessions: PacingSessionLine[];
}

export function buildPacingContext(input: {
  today: string;
  sessions: readonly Session[];
  templates: readonly KataTemplate[];
  checkIns: readonly CheckIn[];
  streakDays: number;
  restDay: boolean;
}): PacingContext {
  const load = dailyLoad(input.sessions, input.templates);
  const envelopeResult = estimateEnvelope(laggedPairs(load, input.checkIns, 1));
  const envelope = 'envelope' in envelopeResult ? envelopeResult.envelope : undefined;
  const decision = recommend({
    today: input.today,
    checkIns: input.checkIns,
    dailyLoad: load,
    envelope,
  });
  const recentSessions = [...input.sessions]
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, 3)
    .map((session) => ({
      label: session.activityLabel ?? 'practice',
      minutes: session.durationMinutes ?? null,
      rating: session.rating,
    }));
  const checkIns = [...input.checkIns]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3)
    .map((checkIn) => ({
      date: checkIn.date,
      energy: checkIn.energy,
      fog: checkIn.fog,
      aches: checkIn.aches,
      sleep: checkIn.sleep,
    }));
  return {
    action: decision.action,
    pct: decision.pct,
    reasons: [...decision.reasons],
    load7: rollingLoad(load, input.today, 7),
    previousLoad7: rollingLoad(load, addDays(input.today, -7), 7),
    checkIns,
    streakDays: input.streakDays,
    restDay: input.restDay,
    recentSessions,
  };
}

export function hashPacingContext(context: PacingContext): string {
  const text = JSON.stringify(context);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function buildDailyBriefingUserText(context: PacingContext): string {
  return [
    'Pacing decision. Phrase it. Do not change the action.',
    JSON.stringify(context),
    '',
    'Reply with JSON only: {"summary":"...","suggestion":"...","tone":"gentle"|"steady"|"encouraging"}.',
  ].join('\n');
}
