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

  it('contains exactly the agreed payload fields', () => {
    const context = buildPacingContext({
      today: '2026-07-21',
      sessions: [session({})],
      templates: [],
      checkIns: [checkIn()],
      streakDays: 3,
      restDay: false,
    });
    expect(Object.keys(context).sort()).toEqual([
      'action', 'checkIns', 'load7', 'pct', 'previousLoad7', 'reasons', 'recentSessions', 'restDay', 'streakDays',
    ]);
  });

  it('snapshots the whole payload from a fixture whose sessions and check-ins carry notes', () => {
    // Sessions sit at 12:00 UTC with a day of buffer inside their load windows,
    // so the load buckets are identical in every timezone and the snapshot is
    // deterministic regardless of the runner's TZ.
    const context = buildPacingContext({
      today: '2026-07-21',
      sessions: [
        session({
          id: '123e4567-e89b-12d3-a456-426614174002',
          startedAt: new Date('2026-07-18T12:00:00Z'),
          note: 'secret session note',
        }),
        session({
          id: '123e4567-e89b-12d3-a456-426614174003',
          startedAt: new Date('2026-07-10T12:00:00Z'),
          durationMinutes: null,
          reps: 108,
          rating: 3,
          activityLabel: 'Qigong',
          note: 'secret reps note',
        }),
      ],
      templates: [],
      checkIns: [
        checkIn({ note: 'secret check-in note' }),
        checkIn({ date: '2026-07-20', energy: 3, note: 'secret check-in note' }),
        checkIn({ date: '2026-07-19', energy: 3, note: 'secret check-in note' }),
      ],
      streakDays: 3,
      restDay: false,
    });
    expect(JSON.stringify(context)).not.toContain('secret');
    expect(context).toMatchInlineSnapshot(`
      {
        "action": "hold",
        "checkIns": [
          {
            "aches": 1,
            "date": "2026-07-21",
            "energy": 4,
            "fog": 2,
            "sleep": 4,
          },
          {
            "aches": 1,
            "date": "2026-07-20",
            "energy": 3,
            "fog": 2,
            "sleep": 4,
          },
          {
            "aches": 1,
            "date": "2026-07-19",
            "energy": 3,
            "fog": 2,
            "sleep": 4,
          },
        ],
        "load7": 20,
        "pct": undefined,
        "previousLoad7": 10.8,
        "reasons": [
          "no rest, reduce, or build trigger fired",
        ],
        "recentSessions": [
          {
            "label": "Walk",
            "minutes": 20,
            "rating": 4,
          },
          {
            "label": "Qigong",
            "minutes": null,
            "rating": 3,
          },
        ],
        "restDay": false,
        "streakDays": 3,
      }
    `);
  });
});
