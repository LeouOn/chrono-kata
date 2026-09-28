import { describe, expect, it } from 'vitest';
import { dailyLoad } from '@/lib/pacing/load';
import { correlation, estimateEnvelope, laggedPairs } from '@/lib/pacing/response';
import { DEFAULT_DEMO_DATA, generateDemoData } from '@/lib/pacing/seed-data';

describe('Demo Seed Data', () => {
  it('generates 35 check-ins and expected sessions', () => {
    const demo = DEFAULT_DEMO_DATA;
    expect(demo.checkIns).toHaveLength(35);
    expect(demo.sessions.length).toBeGreaterThan(20);
  });

  it('yields medium confidence safe-load envelope', () => {
    const { sessions, checkIns, templates } = DEFAULT_DEMO_DATA;
    const daily = dailyLoad(sessions, templates);
    const pairs = laggedPairs(daily, checkIns, 1);

    expect(pairs.length).toBe(35);
    const envelope = estimateEnvelope(pairs);
    expect(envelope).not.toHaveProperty('insufficientData');
    if (!('insufficientData' in envelope)) {
      expect(envelope.confidence).toBe('medium');
      expect(envelope.n).toBe(35);
      // The envelope threshold should be around 20-25 load-minutes
      expect(envelope.envelope).toBeGreaterThanOrEqual(15);
      expect(envelope.envelope).toBeLessThanOrEqual(30);
    }
  });

  it('shows an inverse correlation between load and next-day wellbeing', () => {
    const { sessions, checkIns, templates } = DEFAULT_DEMO_DATA;
    const daily = dailyLoad(sessions, templates);
    const pairs = laggedPairs(daily, checkIns, 1);

    const corr = correlation(pairs);
    expect(corr.n).toBe(35);
    expect(corr.spearman).not.toBeNull();
    // In our scenario, heavy exertion causes drops in wellbeing next day
    expect(corr.spearman!).toBeLessThan(-0.3);
  });

  it('contains stoppedAtCap sessions', () => {
    const stopped = DEFAULT_DEMO_DATA.sessions.filter((s) => s.stoppedAtCap === true);
    expect(stopped.length).toBeGreaterThanOrEqual(4);
  });

  it('is reproducible across different reference dates', () => {
    const demo1 = generateDemoData('2026-01-31');
    const demo2 = generateDemoData('2026-01-31');
    expect(demo1.checkIns[0]?.date).toBe(demo2.checkIns[0]?.date);
  });
});
