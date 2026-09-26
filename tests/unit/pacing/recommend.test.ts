import { describe, expect, it } from 'vitest';
import { recommend } from '@/lib/pacing/recommend';
import { addDays } from '@/lib/pacing/days';
import type { CheckIn } from '@/lib/schemas/check-in';
import type { RecommendInput } from '@/lib/pacing/types';

const TODAY = '2026-09-25';

function day(offset: number): string {
  return addDays(TODAY, -offset);
}

function ci(
  date: string,
  energy: 1 | 2 | 3 | 4 | 5,
  extra: Partial<Pick<CheckIn, 'fog' | 'aches' | 'sleep'>> = {}
): CheckIn {
  return {
    date,
    energy,
    fog: 2,
    aches: 2,
    sleep: 3,
    createdAt: new Date(2026, 8, 25),
    updatedAt: new Date(2026, 8, 25),
    ...extra,
  };
}

/** Wellbeing for the ci() defaults is 0.1*(energy-1)+0.4. */

describe('recommend — rule table', () => {
  it('holds with reason "no check-in yet" when today has no check-in, even under overload', () => {
    const result = recommend({
      today: TODAY,
      checkIns: [ci(day(1), 4), ci(day(2), 4)],
      dailyLoad: new Map([[day(1), 50]]),
      envelope: 20,
    });
    expect(result.action).toBe('hold');
    expect(result.reasons).toContain('no check-in yet');
    expect(result.action).not.toBe('build');
  });

  it.each([
    ['energy at or below 2', [ci(TODAY, 2)], new Map(), 100],
    ['energy dropped 2+ points from the 3-day average', [ci(TODAY, 3), ci(day(1), 5), ci(day(2), 5), ci(day(3), 5)], new Map(), 100],
    ['energy drop computed over available days only (gaps)', [ci(TODAY, 3), ci(day(1), 5), ci(day(3), 5)], new Map(), 100],
  ] as const)('rest when %s', (_name, checkIns, dailyLoad, envelope) => {
    const result = recommend({ today: TODAY, checkIns: [...checkIns], dailyLoad, envelope });
    expect(result.action).toBe('rest');
    expect(result.targetLoad).toBe(0);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('does not rest when the drop is under 2 points', () => {
    const result = recommend({
      today: TODAY,
      checkIns: [ci(TODAY, 3), ci(day(1), 4), ci(day(2), 5), ci(day(3), 4)],
      dailyLoad: new Map([[day(1), 10]]),
      envelope: 20,
    });
    expect(result.action).not.toBe('rest');
  });

  it('discloses the true basis when the crash average uses fewer than 3 prior days', () => {
    // Only today-1 has a check-in (energy 4), so today's 2 crashes against a
    // 1-day average; the reason must say "1 of 3 prior days", not "3-day".
    const result = recommend({
      today: TODAY,
      checkIns: [ci(TODAY, 2), ci(day(1), 4)],
      dailyLoad: new Map(),
      envelope: 100,
    });
    expect(result.action).toBe('rest');
    expect(result.reasons.some((reason) => /1 of 3 prior days/.test(reason))).toBe(true);
  });

  it.each([
    [
      'yesterday load exceeded the envelope',
      { yesterdayLoad: 30, envelope: 20, energies: [4, 4, 4] },
      { action: 'reduce', pct: 20, targetLoad: 24 },
    ],
    [
      'wellbeing trended down over 3 days (envelope undefined)',
      { yesterdayLoad: 10, envelope: undefined, energies: [4, 3, 4, 5] },
      { action: 'reduce', pct: 20, targetLoad: 8 },
    ],
  ] as const)('reduce by 20%% when %s', (_name, fixture, expected) => {
    const checkIns = fixture.energies.map((energy, index) => ci(day(index), energy));
    const result = recommend({
      today: TODAY,
      checkIns,
      dailyLoad: new Map([[day(1), fixture.yesterdayLoad]]),
      envelope: fixture.envelope,
    });
    expect(result.action).toBe(expected.action);
    expect(result.pct).toBe(expected.pct);
    expect(result.targetLoad).toBe(expected.targetLoad);
  });

  it('builds at 10% when wellbeing held >= 0.7 for 5 days and load has headroom', () => {
    const checkIns = [0, 1, 2, 3, 4].map((offset) => ci(day(offset), 4));
    const dailyLoad = new Map([1, 2, 3, 4, 5, 6, 7].map((offset) => [day(offset), 10] as const));
    const result = recommend({ today: TODAY, checkIns, dailyLoad, envelope: 100 });
    expect(result.action).toBe('build');
    expect(result.pct).toBe(10);
    expect(result.targetLoad).toBe(11);
  });

  it.each([
    ['streak broken by one low-wellbeing day', [ci(TODAY, 4), ci(day(1), 4), ci(day(2), 3), ci(day(3), 4), ci(day(4), 4)]],
    ['only four days of history', [ci(TODAY, 4), ci(day(1), 4), ci(day(2), 4), ci(day(3), 4)]],
  ])('does not build when %s', (_name, checkIns) => {
    const dailyLoad = new Map([1, 2, 3, 4, 5, 6, 7].map((offset) => [day(offset), 10] as const));
    const result = recommend({ today: TODAY, checkIns, dailyLoad, envelope: 100 });
    expect(result.action).not.toBe('build');
  });

  it('does not build when the recent load exceeds 80% of the envelope', () => {
    const checkIns = [0, 1, 2, 3, 4].map((offset) => ci(day(offset), 4));
    const dailyLoad = new Map([1, 2, 3, 4, 5, 6, 7].map((offset) => [day(offset), 20] as const));
    // 7-day mean = 20 > 0.8 * 24.
    const result = recommend({ today: TODAY, checkIns, dailyLoad, envelope: 24 });
    expect(result.action).not.toBe('build');
  });

  it('holds when wellbeing is stable and load is within the envelope', () => {
    const result = recommend({
      today: TODAY,
      checkIns: [ci(TODAY, 4), ci(day(1), 3), ci(day(2), 4), ci(day(3), 4)],
      dailyLoad: new Map([[day(1), 10]]),
      envelope: 20,
    });
    expect(result.action).toBe('hold');
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

describe('recommend — invariants and priorities', () => {
  const streak = (energy: 1 | 2 | 3 | 4 | 5, todayExtra?: Partial<Pick<CheckIn, 'fog' | 'aches' | 'sleep'>>) =>
    [0, 1, 2, 3, 4].map((offset) => ci(day(offset), energy, offset === 0 ? todayExtra : {}));

  const lowLoads = () => new Map([1, 2, 3, 4, 5, 6, 7].map((offset) => [day(offset), 10] as const));

  it('never builds when today\'s energy <= 3, even with a perfect build setup', () => {
    // energy 3 with sleep 5, fog 1, aches 1 scores wellbeing 0.8 — the build
    // streak and headroom conditions all hold; only the invariant blocks it.
    const checkIns = streak(3, { sleep: 5, fog: 1, aches: 1 });
    const prior = [1, 2, 3, 4].map((offset) => ci(day(offset), 4));
    const result = recommend({
      today: TODAY,
      checkIns: [checkIns[0]!, ...prior],
      dailyLoad: lowLoads(),
      envelope: 100,
    });
    expect(result.action).not.toBe('build');
    expect(result.action).toBe('hold');
  });

  it('never builds without a check-in today', () => {
    const result = recommend({
      today: TODAY,
      checkIns: [1, 2, 3, 4, 5].map((offset) => ci(day(offset), 4)),
      dailyLoad: lowLoads(),
      envelope: 100,
    });
    expect(result.action).not.toBe('build');
  });

  it('rest beats reduce when both fire', () => {
    const result = recommend({
      today: TODAY,
      checkIns: [ci(TODAY, 2)],
      dailyLoad: new Map([[day(1), 30]]),
      envelope: 20,
    });
    expect(result.action).toBe('rest');
  });

  it('reduce beats build when both fire', () => {
    const result = recommend({
      today: TODAY,
      checkIns: streak(4),
      dailyLoad: new Map([[day(1), 150]]),
      envelope: 100,
    });
    expect(result.action).toBe('reduce');
    expect(result.pct).toBe(20);
    expect(result.targetLoad).toBe(120);
  });
});

describe('recommend — edge cases', () => {
  it('holds on completely empty data', () => {
    const result = recommend({ today: TODAY, checkIns: [], dailyLoad: new Map(), envelope: undefined });
    expect(result.action).toBe('hold');
    expect(result.reasons).toContain('no check-in yet');
  });

  it('holds with a single day of history and no load', () => {
    const result = recommend({
      today: TODAY,
      checkIns: [ci(TODAY, 3)],
      dailyLoad: new Map(),
      envelope: 50,
    });
    expect(result.action).toBe('hold');
  });

  it('builds (targetLoad 0) when all load is zero but the streak and headroom hold', () => {
    const result = recommend({
      today: TODAY,
      checkIns: [0, 1, 2, 3, 4].map((offset) => ci(day(offset), 4)),
      dailyLoad: new Map(),
      envelope: 100,
    });
    expect(result.action).toBe('build');
    expect(result.targetLoad).toBe(0);
  });

  it('treats a missing yesterday as load 0, not overload', () => {
    const result = recommend({
      today: TODAY,
      checkIns: [ci(TODAY, 4)],
      dailyLoad: new Map([[day(3), 500]]),
      envelope: 20,
    });
    expect(result.action).toBe('hold');
  });
});

describe('recommend — property: low energy never builds', () => {
  /** Deterministic mulberry32 PRNG so the property test never flakes. */
  function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const scale = (rng: () => number) => (1 + Math.floor(rng() * 5)) as 1 | 2 | 3 | 4 | 5;

  function randomScenario(rng: () => number): RecommendInput {
    const checkIns: CheckIn[] = [];
    for (let offset = 1; offset <= 29; offset++) {
      if (rng() < 0.7) {
        checkIns.push(ci(day(offset), scale(rng), { fog: scale(rng), aches: scale(rng), sleep: scale(rng) }));
      }
    }
    const dailyLoad = new Map<string, number>();
    for (let offset = 1; offset <= 14; offset++) {
      if (rng() < 0.6) dailyLoad.set(day(offset), Math.round(rng() * 60));
    }
    return {
      today: TODAY,
      checkIns,
      dailyLoad,
      envelope: rng() < 0.3 ? undefined : Math.round(20 + rng() * 100),
    };
  }

  it('never recommends build when today energy <= 3, and never without a check-in, across 200 seeded scenarios', () => {
    const rng = mulberry32(0x5eed);
    let checkedLowEnergy = 0;
    let checkedNoCheckIn = 0;
    let builtWhenAllowed = 0;

    for (let iteration = 0; iteration < 200; iteration++) {
      const flavor = iteration % 4;
      let input: RecommendInput;
      let todayEnergy: number | undefined;

      if (flavor === 0 || flavor === 1) {
        // Build bait: 5-day streak, light load, generous envelope. Prior
        // energies are 4, so the rest rule (crash needs today <= 4-2 = 2)
        // cannot fire and these iterations isolate the build invariant.
        // Flavor 0 keeps energy at 3 (must NOT build); flavor 1 uses 4
        // (must build, proving the bait really triggers build when allowed).
        todayEnergy = flavor === 0 ? 3 : 4;
        input = {
          today: TODAY,
          checkIns: [
            ci(TODAY, todayEnergy as 3 | 4, { sleep: 5, fog: 1, aches: 1 }),
            ...[1, 2, 3, 4].map((offset) => ci(day(offset), 4, { sleep: 5, fog: 1, aches: 1 })),
          ],
          dailyLoad: new Map([1, 2, 3, 4, 5, 6, 7].map((offset) => [day(offset), 5] as const)),
          envelope: 200,
        };
      } else if (flavor === 2) {
        const scenario = randomScenario(rng);
        const energy = scale(rng);
        const withoutToday = scenario.checkIns.filter((c) => c.date !== TODAY);
        input = {
          today: TODAY,
          checkIns: [
            ...withoutToday,
            ci(TODAY, energy, { fog: scale(rng), aches: scale(rng), sleep: scale(rng) }),
          ],
          dailyLoad: scenario.dailyLoad,
          envelope: scenario.envelope,
        };
        todayEnergy = energy;
      } else {
        const scenario = randomScenario(rng);
        input = {
          ...scenario,
          checkIns: scenario.checkIns.filter((c) => c.date !== TODAY),
        };
        todayEnergy = undefined;
      }

      const result = recommend(input);
      expect(result.reasons.length).toBeGreaterThan(0);

      if (todayEnergy === undefined) {
        checkedNoCheckIn++;
        expect(result.action).toBe('hold');
      } else if (todayEnergy <= 3) {
        checkedLowEnergy++;
        expect(result.action).not.toBe('build');
      } else if (result.action === 'build') {
        builtWhenAllowed++;
      }
    }

    // The property run must be non-vacuous on both sides.
    expect(checkedLowEnergy).toBeGreaterThanOrEqual(60);
    expect(checkedNoCheckIn).toBeGreaterThanOrEqual(40);
    expect(builtWhenAllowed).toBeGreaterThanOrEqual(40);
  });
});
