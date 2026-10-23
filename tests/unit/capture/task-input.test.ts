import { describe, expect, it } from 'vitest';
import { parseCapture } from '@/lib/capture/parse-capture';
import { captureToTaskInput, localDayKeyToDate } from '@/lib/capture/task-input';
import { TaskInputSchema } from '@/lib/schemas/task';
import { DEFAULT_DOMAINS, DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';
import { toLocalDateString } from '@/lib/utils/date';

const NOW = new Date(2026, 9, 23, 9, 0);
const DOMAINS = DEFAULT_DOMAINS.map((d) => ({ id: d.id, name: d.name }));

describe('captureToTaskInput', () => {
  it('turns the roadmap example into a schema-valid TaskInput', () => {
    const parsed = parseCapture('fix hose #life ~20m !high tomorrow @hardware-store', {
      now: NOW,
      domains: DOMAINS,
    });
    const input = captureToTaskInput(parsed);

    expect(TaskInputSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({
      title: 'fix hose',
      status: 'inbox',
      source: 'manual',
      domainId: DOMAIN_SEED_IDS.lifeAdmin,
      estimateMin: 20,
      energy: 'high',
      context: ['hardware-store'],
    });
    expect(input?.deferUntil).toBeInstanceOf(Date);
    expect(toLocalDateString(input!.deferUntil!)).toBe('2026-10-24');
  });

  it('leaves an empty line unsaveable instead of building an invalid row', () => {
    expect(captureToTaskInput(parseCapture('', { now: NOW }))).toBeNull();
    expect(captureToTaskInput(parseCapture('   ', { now: NOW }))).toBeNull();
  });

  it('accepts a source override', () => {
    const input = captureToTaskInput(parseCapture('call bank', { now: NOW }), { source: 'share' });
    expect(input?.source).toBe('share');
  });

  it('omits unparsed fields rather than inventing values', () => {
    const input = captureToTaskInput(parseCapture('call bank', { now: NOW }));
    expect(input).toMatchObject({
      title: 'call bank',
      domainId: null,
      estimateMin: null,
      energy: null,
      context: null,
      deferUntil: null,
    });
  });

  it('keeps every table-driven capture saveable', () => {
    const lines = [
      'fix hose #life ~20m !high tomorrow @hardware-store',
      'fix #garden hose',
      '#life ~20m !high',
      '— café ☕ with Ana #life',
      `a ${'very '.repeat(60)}long line`,
      'Friday night plan',
      'file taxes 2026-11-03',
      'renew domain in 3 days',
    ];
    for (const line of lines) {
      const parsed = parseCapture(line, { now: NOW, domains: DOMAINS });
      const input = captureToTaskInput(parsed);
      expect(input, line).not.toBeNull();
      expect(TaskInputSchema.safeParse(input).success, line).toBe(true);
    }
  });
});

describe('localDayKeyToDate', () => {
  it('returns local midday, so the day never shifts across DST', () => {
    const date = localDayKeyToDate('2026-10-25');
    expect(date.getHours()).toBe(12);
    expect(toLocalDateString(date)).toBe('2026-10-25');
  });

  it('never produces a UTC-day mismatch', () => {
    const date = localDayKeyToDate('2026-01-01');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
  });
});
