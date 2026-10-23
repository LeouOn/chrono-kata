/**
 * Totality bar for the capture bridge (review finding on #24).
 *
 * `captureToTaskInput` must NEVER throw, for any input, and every value it
 * returns must satisfy `TaskInputSchema`. The parser stays schema-agnostic:
 * values the Task schema cannot hold (a too-long @context, an 11th context, a
 * relative date beyond the 100-year cap) are left in the title there, and the
 * bridge additionally falls back to a title-only input if validation ever fails
 * (defense in depth).
 *
 * The seeded RNG makes a failure reproducible: the failing line is printed and
 * the seed is fixed.
 */
import { describe, expect, it } from 'vitest';
import { parseCapture, type CaptureDomain } from '@/lib/capture/parse-capture';
import { captureToTaskInput } from '@/lib/capture/task-input';
import { TaskInputSchema } from '@/lib/schemas/task';
import { DEFAULT_DOMAINS } from '@/lib/db/seed-domains';

const NOW = new Date(2026, 9, 23, 9, 0);
const DOMAINS: CaptureDomain[] = DEFAULT_DOMAINS.map((d) => ({ id: d.id, name: d.name }));

/** mulberry32: small deterministic PRNG so the fuzz case reproduces exactly. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['fix', 'hose', 'call', 'plumber', 'write', 'report', 'café', '🥋', 'a'.repeat(60), 'Ünïcode'];
const TAGS = ['#life', '#practice', '#career/build', '#garden', '#h', '#LIFE', '#' + 'x'.repeat(60)];
const CONTEXTS = [
  '@shop',
  '@phone',
  '@' + 'c'.repeat(50),
  '@' + 'c'.repeat(51),
  '@' + 'c'.repeat(120),
  ...Array.from({ length: 14 }, (_, i) => `@t${i}`),
];
const ESTIMATES = ['~20m', '~1h', '~1h30m', '~90m', '~0m', '~200h', '~999999999999m', '~25 min'];
const ENERGIES = ['!low', '!med', '!high', '!l', '!m', '!h', '!'];
const DATES = [
  'today',
  'tomorrow',
  'mon',
  'fri',
  'next mon',
  'in 3 days',
  'in 2 weeks',
  'in 999999999 days',
  'in 2147483647 days',
  'in 100000000000 days',
  'in 999999999 weeks',
  '2026-11-03',
  '2026-02-31',
  '2028-02-29',
];
const PUNCTUATION = ['!', ',', ';', '.', ''];
const ALPHABET = [...WORDS, ...TAGS, ...CONTEXTS, ...ESTIMATES, ...ENERGIES, ...DATES, ...PUNCTUATION];

function fuzzLines(count: number, seed: number): string[] {
  const random = rng(seed);
  const lines: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const length = Math.floor(random() * 13);
    const tokens: string[] = [];
    for (let t = 0; t < length; t += 1) {
      tokens.push(ALPHABET[Math.floor(random() * ALPHABET.length)]!);
    }
    const separator = random() < 0.08 ? '\n' : ' ';
    lines.push(tokens.join(separator));
  }
  return lines;
}

describe('captureToTaskInput is total', () => {
  const lines = fuzzLines(2000, 0x5eed);

  it('never throws and every non-null result is a valid TaskInput', () => {
    for (const line of lines) {
      const parsed = parseCapture(line, { now: NOW, domains: DOMAINS });
      let input: ReturnType<typeof captureToTaskInput> = null;
      try {
        input = captureToTaskInput(parsed);
      } catch (error) {
        throw new Error(`threw for ${JSON.stringify(line)}: ${String(error)}`);
      }

      if (input == null) {
        expect(parsed.title.trim(), `null input only for an empty title: ${JSON.stringify(line)}`).toBe('');
        continue;
      }
      const checked = TaskInputSchema.safeParse(input);
      expect(checked.success, `invalid TaskInput for: ${JSON.stringify(line)} :: ${checked.success ? '' : checked.error.message}`).toBe(true);
      expect(input.title.length).toBeGreaterThan(0);
      expect(input.title.length).toBeLessThanOrEqual(200);
      expect((input.context ?? []).length).toBeLessThanOrEqual(10);
      for (const context of input.context ?? []) expect(context.length).toBeLessThanOrEqual(50);
      expect(input.deferUntil === null || input.deferUntil instanceof Date).toBe(true);
      if (input.deferUntil instanceof Date) expect(Number.isFinite(input.deferUntil.getTime())).toBe(true);
    }
  });

  it('never throws when the parser result itself is out of contract', () => {
    // Defense in depth: even a ParsedCapture the schema would reject must not
    // throw and must not lose the text.
    const impossible = {
      raw: 'anything',
      title: 'keep this text',
      domainId: 'not-a-uuid',
      domainTag: '#x',
      estimateMin: 99_999_999,
      energy: 'extreme',
      today: '2026-10-23',
      deferUntil: 'not-a-day',
      contexts: Array.from({ length: 40 }, (_, i) => `context-${i}-${'x'.repeat(40)}`),
      unknownDomainTags: [],
    } as unknown as ReturnType<typeof parseCapture>;

    const input = captureToTaskInput(impossible);
    expect(input).not.toBeNull();
    expect(input!.title).toBe('keep this text');
    expect(TaskInputSchema.safeParse(input).success).toBe(true);
  });

  it('documents the three named repros are closed', () => {
    const elevenContexts = `fix ${Array.from({ length: 11 }, (_, i) => `@t${i}`).join(' ')}`;
    const longContext = `meet @${'c'.repeat(55)}`;
    const hugeDays = 'renew in 100000000 days';

    for (const line of [elevenContexts, longContext, hugeDays]) {
      const parsed = parseCapture(line, { now: NOW, domains: DOMAINS });
      const input = captureToTaskInput(parsed);
      expect(input, line).not.toBeNull();
      expect(TaskInputSchema.safeParse(input).success, line).toBe(true);
    }
  });
});
