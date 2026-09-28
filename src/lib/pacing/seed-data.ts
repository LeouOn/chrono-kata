import type { CheckIn } from '@/lib/schemas/check-in';
import type { KataTemplate } from '@/lib/schemas/kata-template';
import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';
import { addDays } from './days';

export const DEMO_TEMPLATES: KataTemplate[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Morning Qi Gong',
    mode: 'timed',
    defaultDurationMinutes: 15,
    softCapMinutes: 20,
    activityLabel: 'Qi Gong',
    intensity: 1, // gentle
    icon: '🌿',
    order: 0,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Posture & Forms Practice',
    mode: 'timed',
    defaultDurationMinutes: 25,
    softCapMinutes: 25,
    activityLabel: 'Kata Practice',
    intensity: 2, // moderate
    icon: '🥋',
    order: 1,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Resistance & Core',
    mode: 'timed',
    defaultDurationMinutes: 20,
    softCapMinutes: 20,
    activityLabel: 'Strength',
    intensity: 3, // hard
    icon: '⚡',
    order: 2,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  },
];

/**
 * 35-day deterministic pacing trajectory.
 * Designed to demonstrate post-Lyme recovery dynamics:
 * - Tolerated load threshold around 20-25 load-minutes.
 * - Days with load > 25 min trigger next-day symptom flares (energy drop, aches/fog).
 * - Rest days and low-load days allow steady recovery.
 * - 5 sessions stopped at soft cap, showing pacing discipline.
 */
interface DaySchedule {
  readonly dayOffset: number; // 0 = reference date, -1 = yesterday, etc.
  readonly sessions: Array<{
    readonly templateIndex: number;
    readonly durationMinutes: number;
    readonly stoppedAtCap?: boolean;
    readonly rating: 1 | 2 | 3 | 4 | 5;
  }>;
  readonly checkIn: {
    readonly energy: 1 | 2 | 3 | 4 | 5;
    readonly fog: 1 | 2 | 3 | 4 | 5;
    readonly aches: 1 | 2 | 3 | 4 | 5;
    readonly sleep: 1 | 2 | 3 | 4 | 5;
    readonly note?: string;
  };
}

// 35 days (day -34 up to day 0).
const SCHEDULE: DaySchedule[] = [
  // Week 1: Baseline gentle loading (days -34 to -28)
  {
    dayOffset: -34,
    sessions: [{ templateIndex: 0, durationMinutes: 15, rating: 4, stoppedAtCap: true }], // load 15
    checkIn: { energy: 5, fog: 1, aches: 1, sleep: 5, note: 'Feeling rested and steady.' },
  },
  {
    dayOffset: -33,
    sessions: [{ templateIndex: 1, durationMinutes: 10, rating: 4 }], // load 20
    checkIn: { energy: 4, fog: 1, aches: 1, sleep: 5 }, // response to -34 (15m) -> 0.85
  },
  {
    dayOffset: -32,
    sessions: [], // rest day, load 0
    checkIn: { energy: 4, fog: 2, aches: 1, sleep: 4 }, // response to -33 (20m) -> 0.80
  },
  {
    dayOffset: -31,
    sessions: [{ templateIndex: 0, durationMinutes: 12, rating: 4 }], // load 12
    checkIn: { energy: 5, fog: 1, aches: 1, sleep: 5 }, // response to -32 (0m) -> 1.0
  },
  {
    dayOffset: -30,
    sessions: [{ templateIndex: 0, durationMinutes: 20, rating: 4, stoppedAtCap: true }], // load 20
    checkIn: { energy: 4, fog: 1, aches: 1, sleep: 4 }, // response to -31 (12m) -> 0.85
  },
  {
    dayOffset: -29,
    // Overexertion: 25m moderate (load 50)
    sessions: [{ templateIndex: 1, durationMinutes: 25, rating: 3 }],
    checkIn: { energy: 4, fog: 2, aches: 2, sleep: 4 }, // response to -30 (20m) -> 0.75
  },
  {
    dayOffset: -28,
    // Flare response from yesterday's 50 load-min: energy 2, fog 4, aches 4, sleep 2 (wellbeing 0.25)
    sessions: [{ templateIndex: 0, durationMinutes: 8, rating: 3 }], // gentle recovery, load 8
    checkIn: { energy: 2, fog: 4, aches: 4, sleep: 2, note: 'Post-exertional crash from 25m kata.' },
  },

  // Week 2: Recovery & pacing back to safety (days -27 to -21)
  {
    dayOffset: -27,
    sessions: [{ templateIndex: 0, durationMinutes: 10, rating: 3 }], // load 10
    checkIn: { energy: 4, fog: 2, aches: 2, sleep: 4, note: 'Gentle recovery breathing only.' }, // response to 8m -> 0.75
  },
  {
    dayOffset: -26,
    sessions: [{ templateIndex: 0, durationMinutes: 12, rating: 3 }], // load 12
    checkIn: { energy: 4, fog: 2, aches: 1, sleep: 4 }, // response to 10m -> 0.80
  },
  {
    dayOffset: -25,
    sessions: [{ templateIndex: 1, durationMinutes: 10, rating: 4 }], // load 20
    checkIn: { energy: 4, fog: 1, aches: 2, sleep: 4 }, // response to 12m -> 0.80
  },
  {
    dayOffset: -24,
    sessions: [], // rest day, load 0
    checkIn: { energy: 4, fog: 2, aches: 2, sleep: 4 }, // response to 20m -> 0.75
  },
  {
    dayOffset: -23,
    sessions: [{ templateIndex: 0, durationMinutes: 15, rating: 4 }], // load 15
    checkIn: { energy: 5, fog: 1, aches: 1, sleep: 5 }, // response to 0m -> 1.0
  },
  {
    dayOffset: -22,
    sessions: [{ templateIndex: 1, durationMinutes: 11, rating: 4 }], // load 22
    checkIn: { energy: 4, fog: 1, aches: 1, sleep: 4 }, // response to 15m -> 0.85
  },
  {
    dayOffset: -21,
    sessions: [], // rest day, load 0
    checkIn: { energy: 4, fog: 2, aches: 2, sleep: 4 }, // response to 22m -> 0.75
  },

  // Week 3: Testing upper boundary (days -20 to -14)
  {
    dayOffset: -20,
    sessions: [{ templateIndex: 0, durationMinutes: 15, rating: 4 }], // load 15
    checkIn: { energy: 5, fog: 1, aches: 1, sleep: 4 }, // response to 0m -> 0.90
  },
  {
    dayOffset: -19,
    sessions: [{ templateIndex: 0, durationMinutes: 20, rating: 4, stoppedAtCap: true }], // load 20
    checkIn: { energy: 4, fog: 1, aches: 1, sleep: 4 }, // response to 15m -> 0.85
  },
  {
    dayOffset: -18,
    // Moderate overload: 15m strength (intensity 3 = 45 load-min)
    sessions: [{ templateIndex: 2, durationMinutes: 15, rating: 3 }],
    checkIn: { energy: 4, fog: 2, aches: 2, sleep: 4 }, // response to 20m -> 0.75
  },
  {
    dayOffset: -17,
    // Response to day -18 (45 load-min) -> crash
    sessions: [{ templateIndex: 0, durationMinutes: 8, rating: 3 }], // recovery, load 8
    checkIn: { energy: 2, fog: 3, aches: 4, sleep: 2, note: 'Delayed aches and brain fog.' }, // 0.30
  },
  {
    dayOffset: -16,
    sessions: [{ templateIndex: 0, durationMinutes: 10, rating: 3 }], // load 10
    checkIn: { energy: 4, fog: 2, aches: 2, sleep: 4 }, // response to 8m -> 0.75
  },
  {
    dayOffset: -15,
    sessions: [{ templateIndex: 0, durationMinutes: 15, rating: 4 }], // load 15
    checkIn: { energy: 4, fog: 1, aches: 2, sleep: 4 }, // response to 10m -> 0.80
  },
  {
    dayOffset: -14,
    sessions: [{ templateIndex: 1, durationMinutes: 10, rating: 4 }], // load 20
    checkIn: { energy: 4, fog: 1, aches: 1, sleep: 4 }, // response to 15m -> 0.85
  },

  // Week 4: Finding the sweet spot <= 24 load-min (days -13 to -7)
  {
    dayOffset: -13,
    sessions: [{ templateIndex: 1, durationMinutes: 11, rating: 4 }], // load 22
    checkIn: { energy: 4, fog: 2, aches: 2, sleep: 4 }, // response to 20m -> 0.75
  },
  {
    dayOffset: -12,
    sessions: [], // rest day, load 0
    checkIn: { energy: 4, fog: 2, aches: 2, sleep: 4 }, // response to 22m -> 0.75
  },
  {
    dayOffset: -11,
    sessions: [{ templateIndex: 0, durationMinutes: 15, rating: 4 }], // load 15
    checkIn: { energy: 5, fog: 1, aches: 1, sleep: 5 }, // response to 0m -> 1.0
  },
  {
    dayOffset: -10,
    sessions: [{ templateIndex: 1, durationMinutes: 12, rating: 4, stoppedAtCap: true }], // load 24
    checkIn: { energy: 4, fog: 1, aches: 1, sleep: 4 }, // response to 15m -> 0.85
  },
  {
    dayOffset: -9,
    sessions: [{ templateIndex: 0, durationMinutes: 15, rating: 4 }], // load 15
    checkIn: { energy: 4, fog: 2, aches: 2, sleep: 4 }, // response to 24m -> 0.75
  },
  {
    dayOffset: -8,
    // Heavy accidental push: 20m strength (intensity 3 = 60 load-min)
    sessions: [{ templateIndex: 2, durationMinutes: 20, rating: 3 }],
    checkIn: { energy: 4, fog: 1, aches: 1, sleep: 4 }, // response to 15m -> 0.85
  },
  {
    dayOffset: -7,
    // Severe crash response to 60 load-min
    sessions: [{ templateIndex: 0, durationMinutes: 6, rating: 3 }], // gentle recovery 6 load-min
    checkIn: { energy: 1, fog: 5, aches: 4, sleep: 2, note: 'Major flare up. Body feels like lead.' }, // 0.15
  },

  // Week 5: Recovery and disciplined pacing within envelope (days -6 to 0)
  {
    dayOffset: -6,
    sessions: [], // rest day, load 0
    checkIn: { energy: 4, fog: 2, aches: 2, sleep: 4 }, // response to 6m -> 0.75
  },
  {
    dayOffset: -5,
    sessions: [{ templateIndex: 0, durationMinutes: 10, rating: 3 }], // load 10
    checkIn: { energy: 5, fog: 1, aches: 1, sleep: 4 }, // response to 0m -> 0.90
  },
  {
    dayOffset: -4,
    sessions: [{ templateIndex: 0, durationMinutes: 15, rating: 4 }], // load 15
    checkIn: { energy: 4, fog: 1, aches: 2, sleep: 4 }, // response to 10m -> 0.80
  },
  {
    dayOffset: -3,
    sessions: [{ templateIndex: 1, durationMinutes: 10, rating: 4 }], // load 20
    checkIn: { energy: 4, fog: 1, aches: 1, sleep: 4 }, // response to 15m -> 0.85
  },
  {
    dayOffset: -2,
    sessions: [{ templateIndex: 1, durationMinutes: 11, rating: 4 }], // load 22
    checkIn: { energy: 4, fog: 2, aches: 2, sleep: 4 }, // response to 20m -> 0.75
  },
  {
    dayOffset: -1,
    sessions: [{ templateIndex: 0, durationMinutes: 18, rating: 4, stoppedAtCap: true }], // load 18
    checkIn: { energy: 4, fog: 2, aches: 2, sleep: 4 }, // response to 22m -> 0.75
  },
  {
    dayOffset: 0,
    sessions: [{ templateIndex: 0, durationMinutes: 15, rating: 4 }], // load 15
    checkIn: { energy: 4, fog: 1, aches: 1, sleep: 4, note: 'Pacing working well; holding steady.' }, // response to 18m -> 0.85
  },
];

export interface DemoDataset {
  readonly templates: KataTemplate[];
  readonly sessions: Session[];
  readonly checkIns: CheckIn[];
  readonly referenceDate: string;
}

export function generateDemoData(referenceDate?: string): DemoDataset {
  const baseDateStr = referenceDate ?? toLocalDateString(new Date());

  const templates = [...DEMO_TEMPLATES];
  const sessions: Session[] = [];
  const checkIns: CheckIn[] = [];

  let sessionCounter = 1;

  for (const item of SCHEDULE) {
    const dayKey = addDays(baseDateStr, item.dayOffset);
    // Anchor time at 09:00 local time on that day
    const [y, m, d] = dayKey.split('-').map(Number);
    const dayDate = new Date(y!, m! - 1, d!, 9, 0, 0);

    // Create check-in
    checkIns.push({
      date: dayKey,
      energy: item.checkIn.energy,
      fog: item.checkIn.fog,
      aches: item.checkIn.aches,
      sleep: item.checkIn.sleep,
      note: item.checkIn.note,
      createdAt: dayDate,
      updatedAt: dayDate,
    });

    // Create sessions
    item.sessions.forEach((s, idx) => {
      const template = templates[s.templateIndex]!;
      const startTime = new Date(dayDate.getTime() + idx * 3600_000 + 3600_000 * 2); // 11am, 12pm, etc.
      const endTime = new Date(startTime.getTime() + s.durationMinutes * 60_000);
      const hex = String(sessionCounter++).padStart(12, '0');
      sessions.push({
        id: `00000000-0000-4000-9000-${hex}`,
        startedAt: startTime,
        endedAt: endTime,
        durationMinutes: s.durationMinutes,
        reps: null,
        rating: s.rating,
        activityLabel: template.name,
        kataTemplateId: template.id,
        stoppedAtCap: s.stoppedAtCap ?? false,
        createdAt: startTime,
        updatedAt: endTime,
      });
    });
  }

  return { templates, sessions, checkIns, referenceDate: baseDateStr };
}

/** Pre-computed static demo dataset for fast tests & SSR. */
export const DEFAULT_DEMO_DATA: DemoDataset = generateDemoData('2026-09-28');
