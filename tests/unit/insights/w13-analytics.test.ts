import { afterEach, describe, expect, it } from 'vitest';
import {
  calibrationFactor,
  cadenceAdherence,
  estimateAccuracy,
  inboxThroughput,
  localWeekKey,
  projectTimeInvested,
  timePerDomain,
  RATIO_MAX,
  RATIO_MIN,
  CALIBRATION_MIN_SAMPLES,
} from '@/lib/insights/analytics';
import { BIAS, DOMAINS, generateHistory, NOW } from './w13-fixtures';

/**
 * Oracle for Wave 13 PR 1: the analytics must RECOVER the generator's known
 * ground truth, be robust to an injected outlier, be additive, and be
 * invariant to input order and (where the concept is zone-independent) to the
 * runner's timezone.
 */

const previousTz = process.env.TZ;
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const history = generateHistory(20260630);
const input = { now: NOW, ...history };

function closeTo(actual: number, expected: number, tolerance = 0.03): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

describe('W13 oracle: the analytics recover the ground truth', () => {
  it('per-source medians recover the baked-in biases', () => {
    const accuracy = estimateAccuracy(input);
    const userMedian = accuracy.bySource['user']!.median;
    const modelAMedian = accuracy.bySource['modelA']!.median;
    const modelBMedian = accuracy.bySource['modelB']!.median;
    // user estimates 0.7x actual -> ratio 1/0.7; modelA 1.3x; modelB exact.
    expect(closeTo(userMedian, 1 / BIAS.user)).toBe(true);
    expect(closeTo(modelAMedian, BIAS.modelA)).toBe(true);
    expect(closeTo(modelBMedian, 1.0)).toBe(true);
  });

  it('the personal calibration factor is the user median', () => {
    const calibration = calibrationFactor(input);
    expect(calibration.basis).toBe('enough-data');
    expect(calibration.sampleSize).toBeGreaterThanOrEqual(CALIBRATION_MIN_SAMPLES);
    expect(closeTo(calibration.factor!, 1 / BIAS.user)).toBe(true);
  });

  it('the median is robust to an injected outlier (clamped at RATIO_MAX)', () => {
    // One task whose actual is 50x its user estimate.
    const victim = history.tasks.find((t) => t.status === 'done')!;
    const sessions = history.sessions.map((s) =>
      s.taskId === victim.id && s.durationMinutes != null
        ? { ...s, durationMinutes: s.durationMinutes * 50 }
        : s,
    );
    const polluted = estimateAccuracy({ ...input, sessions });
    expect(closeTo(polluted.bySource['user']!.median, 1 / BIAS.user, 0.02)).toBe(true);
    expect(polluted.overall!.max).toBeLessThanOrEqual(RATIO_MAX);
  });

  it('per-domain minutes add up to the attributed total (tasks AND project-only sessions)', () => {
    const domains = timePerDomain(input);
    const projectIds = new Set(history.projects.map((p) => p.id));
    const attributed = history.sessions.reduce(
      (sum, s) =>
        sum +
        (s.durationMinutes != null && (s.taskId != null || (s.projectId != null && projectIds.has(s.projectId)))
          ? s.durationMinutes
          : 0),
      0,
    );
    const total = domains.reduce((sum, d) => sum + d.minutes, 0);
    expect(total).toBeCloseTo(attributed, 6);
    for (const domain of DOMAINS) {
      expect(domains.some((d) => d.domainId === domain)).toBe(true);
    }
    // Every task resolves a domain directly or through its project, and the
    // project-only touches resolve their project's domain, so no null-domain
    // bucket may exist in this fixture (kills a dropped project-domain
    // fallback on either side).
    expect(domains.every((d) => d.domainId != null)).toBe(true);
    // The weekly minimum-viable touches are visible per domain.
    const trading = domains.find((d) => d.domainId === DOMAINS[0])!;
    expect(trading.minutes).toBeGreaterThanOrEqual(13 * 10);
  });

  it('results are identical over shuffled input', () => {
    const shuffle = <T,>(rows: readonly T[], seed: number): T[] => {
      let a = seed >>> 0;
      const out = [...rows];
      for (let i = out.length - 1; i > 0; i--) {
        a = (a + 0x6d2b79f5) | 0;
        const t = Math.imul(a ^ (a >>> 15), 1 | a);
        const j = ((t ^ (t >>> 14)) >>> 0) % (i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    };
    const shuffled = {
      ...input,
      sessions: shuffle(input.sessions, 7),
      tasks: shuffle(input.tasks, 11),
      estimates: shuffle(input.estimates, 13),
    };
    expect(JSON.stringify(estimateAccuracy(shuffled))).toBe(JSON.stringify(estimateAccuracy(input)));
    expect(JSON.stringify(timePerDomain(shuffled))).toBe(JSON.stringify(timePerDomain(input)));
    expect(JSON.stringify(calibrationFactor(shuffled))).toBe(JSON.stringify(calibrationFactor(input)));
    expect(JSON.stringify(projectTimeInvested(shuffled))).toBe(JSON.stringify(projectTimeInvested(input)));
  });

  it('the six zones agree on every zone-independent number', () => {
    const zones = [
      'Europe/Helsinki',
      'America/Los_Angeles',
      'Pacific/Kiritimati',
      'Pacific/Auckland',
      'Asia/Kolkata',
      'UTC',
    ];
    const baseline = (() => {
      process.env.TZ = 'UTC';
      return {
        accuracy: estimateAccuracy(input),
        calibration: calibrationFactor(input),
        domains: timePerDomain(input),
      };
    })();
    for (const zone of zones) {
      process.env.TZ = zone;
      expect(estimateAccuracy(input).overall).toEqual(baseline.accuracy.overall);
      expect(calibrationFactor(input)).toEqual(baseline.calibration);
      // Domain minutes are sums over sessions — zone-independent.
      expect(timePerDomain(input)).toEqual(baseline.domains);
    }
  });

  it('cadence weeks sum back to the attributed session counts', () => {
    const adherence = cadenceAdherence(input);
    expect(adherence.length).toBe(2);
    for (const project of adherence) {
      // The shared rule: session.projectId wins, else the task's project —
      // so the project-only touches count too.
      const taskProject = new Map(history.tasks.map((t) => [t.id, t.projectId] as const));
      const attributed = history.sessions.filter((s) => {
        const pid = s.projectId ?? (s.taskId != null ? taskProject.get(s.taskId) ?? null : null);
        return pid === project.projectId;
      }).length;
      expect(project.weeks.reduce((sum, w) => sum + w.sessions, 0)).toBe(attributed);
    }
  });

  it('inbox throughput counts captured and still-unprocessed tasks', () => {
    const throughput = inboxThroughput(input, 90);
    const capturedIn = history.tasks.filter((t) => t.createdAt >= new Date(NOW.getTime() - 90 * 24 * 3600 * 1000));
    expect(throughput.captured).toBe(capturedIn.length);
    const processedIn = capturedIn.filter((t) => t.status !== 'inbox');
    expect(throughput.processed).toBe(processedIn.length);
  });
});

describe('W13 unit edges', () => {
  it('localWeekKey is Monday-start and crosses month boundaries', () => {
    // 2026-06-01 is a Monday; 2026-05-31 is a Sunday -> its week starts 05-25.
    expect(localWeekKey('2026-06-01')).toBe('2026-06-01');
    expect(localWeekKey('2026-05-31')).toBe('2026-05-25');
    expect(localWeekKey('2026-06-03')).toBe('2026-06-01');
  });

  it('ratios clamp to the documented range', () => {
    const tiny = estimateAccuracy({
      now: NOW,
      sessions: [],
      tasks: [],
      projects: [],
      estimates: [],
    });
    expect(tiny.overall).toBeNull();
    expect(RATIO_MIN).toBe(0.1);
    expect(RATIO_MAX).toBe(10);
  });

  it('calibration says not-enough-data below the minimum sample size', () => {
    const calibration = calibrationFactor({
      now: NOW,
      sessions: [],
      tasks: [],
      projects: [],
      estimates: [],
    });
    expect(calibration).toEqual({ factor: null, sampleSize: 0, basis: 'not-enough-data' });
  });

  it('the LATEST estimate per source wins (stale revisions are ignored)', () => {
    const accuracy = estimateAccuracy(input);
    // modelA had bad old revisions (2x); if the stale ones were used the
    // median would be ~2, not 1.3.
    expect(closeTo(accuracy.bySource['modelA']!.median, BIAS.modelA)).toBe(true);
  });

  it('a task with no attributed sessions is not part of the accuracy set', () => {
    // All sessions stripped -> no ratios at all.
    const accuracy = estimateAccuracy({ ...input, sessions: [] });
    expect(accuracy.overall).toBeNull();
  });
});
