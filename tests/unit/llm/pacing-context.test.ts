import { describe, expect, it } from 'vitest';
import { buildDailyBriefingUserText, buildPacingContext } from '@/lib/llm/pacing-context';
import type { CheckIn } from '@/lib/schemas/check-in';
import type { Session } from '@/lib/schemas/session';

const now = new Date('2026-07-21T15:00:00Z');

function session(partial: Partial<Session>): Session {
  return {
    id: '123e4567-e89b-12d3-a456-426614174001',
    startedAt: now,
    durationMinutes: 20,
    reps: null,
    rating: 4,
    activityLabel: 'Walk',
    note: 'secret session note',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function checkIn(partial: Partial<CheckIn> = {}): CheckIn {
  return {
    date: '2026-07-21',
    energy: 4,
    fog: 2,
    aches: 1,
    sleep: 4,
    note: 'secret check-in note',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('buildPacingContext', () => {
  it('sends the decision and numbers, and leaves notes out', () => {
    const context = buildPacingContext({
      today: '2026-07-21',
      sessions: [session({})],
      templates: [],
      checkIns: [checkIn()],
      streakDays: 3,
      restDay: false,
    });
    const text = buildDailyBriefingUserText(context);
    expect(text).toContain('"action"');
    expect(text).toContain('Walk');
    expect(text).toContain('"streakDays":3');
    expect(text).not.toContain('secret session note');
    expect(text).not.toContain('secret check-in note');
    expect(context.checkIns[0]).toEqual({
      date: '2026-07-21',
      energy: 4,
      fog: 2,
      aches: 1,
      sleep: 4,
    });
    expect(context.recentSessions).toEqual([{ label: 'Walk', minutes: 20, rating: 4 }]);
  });
});
