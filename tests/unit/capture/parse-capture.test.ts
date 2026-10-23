import { describe, expect, it } from 'vitest';
import { parseCapture, type CaptureDomain } from '@/lib/capture/parse-capture';
import { DEFAULT_DOMAINS, DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';

/** Friday 2026-10-23, 09:00 local. */
const NOW = new Date(2026, 9, 23, 9, 0);
const DOMAINS: CaptureDomain[] = DEFAULT_DOMAINS.map((d) => ({ id: d.id, name: d.name }));

const BASE = { now: NOW, domains: DOMAINS } as const;

interface Case {
  name: string;
  line: string;
  domains?: CaptureDomain[];
  now?: Date;
  expected: Record<string, unknown>;
}

const CASES: Case[] = [
  {
    name: 'roadmap example parses every token',
    line: 'fix hose #life ~20m !high tomorrow @hardware-store',
    expected: {
      title: 'fix hose',
      domainId: DOMAIN_SEED_IDS.lifeAdmin,
      domainTag: '#life',
      estimateMin: 20,
      energy: 'high',
      deferUntil: '2026-10-24',
      contexts: ['hardware-store'],
      unknownDomainTags: [],
    },
  },
  {
    name: 'plain text stays untouched',
    line: 'write the weekly review',
    expected: { title: 'write the weekly review', domainId: null, estimateMin: null, energy: null, deferUntil: null },
  },
  {
    name: 'tags in the middle of the line are removed',
    line: 'call #life plumber about the leak',
    expected: { title: 'call plumber about the leak', domainId: DOMAIN_SEED_IDS.lifeAdmin },
  },
  {
    name: 'repeated domain tags: last one wins',
    line: 'sort the shed #life #practice',
    expected: { title: 'sort the shed', domainId: DOMAIN_SEED_IDS.practice, domainTag: '#practice' },
  },
  {
    name: 'unknown tag is reported and kept in the title',
    line: 'fix #garden hose',
    expected: {
      title: 'fix #garden hose',
      domainId: null,
      domainTag: null,
      unknownDomainTags: ['#garden'],
    },
  },
  {
    name: 'ambiguous prefix is unknown and kept in the title',
    line: 'tidy the #h shelf',
    domains: [
      { id: 'd-home', name: 'Home' },
      { id: 'd-hobby', name: 'Hobby' },
    ],
    expected: { title: 'tidy the #h shelf', domainId: null, unknownDomainTags: ['#h'] },
  },
  {
    name: 'domain resolves case-insensitively',
    line: 'morning sit #PRACTICE',
    expected: { title: 'morning sit', domainId: DOMAIN_SEED_IDS.practice, domainTag: '#PRACTICE' },
  },
  {
    name: 'domain name with punctuation matches a flattened tag',
    line: 'ship the draft #career/build',
    expected: { title: 'ship the draft', domainId: DOMAIN_SEED_IDS.career },
  },
  {
    name: 'a hash inside a URL is not a domain tag',
    line: 'read https://example.com/page#fix later',
    expected: { title: 'read https://example.com/page#fix later', domainId: null, unknownDomainTags: [] },
  },
  {
    name: 'an @ inside an email is not a context',
    line: 'mail bob@example.com about invoicing',
    expected: { title: 'mail bob@example.com about invoicing', contexts: [] },
  },
  {
    name: 'exclamation as punctuation is not energy',
    line: 'call mum!',
    expected: { title: 'call mum!', energy: null },
  },
  {
    name: 'energy shorthand !h',
    line: 'deep clean kitchen !h',
    expected: { title: 'deep clean kitchen', energy: 'high' },
  },
  {
    name: 'energy !med',
    line: 'file receipts !med',
    expected: { title: 'file receipts', energy: 'med' },
  },
  {
    name: 'estimate hours',
    line: 'draft the proposal ~1h',
    expected: { title: 'draft the proposal', estimateMin: 60 },
  },
  {
    name: 'estimate hours and minutes',
    line: 'fix the shed roof ~1h30m',
    expected: { title: 'fix the shed roof', estimateMin: 90 },
  },
  {
    name: 'estimate minutes with suffix',
    line: 'clear inbox ~90m',
    expected: { title: 'clear inbox', estimateMin: 90 },
  },
  {
    name: 'estimate minutes with word suffix and space',
    line: 'stretch ~25 min',
    expected: { title: 'stretch', estimateMin: 25 },
  },
  {
    name: 'estimate in the middle of a sentence',
    line: 'review notes ~10m before the call',
    expected: { title: 'review notes before the call', estimateMin: 10 },
  },
  {
    name: 'zero estimate is not consumed',
    line: 'warm up ~0m',
    expected: { title: 'warm up ~0m', estimateMin: null },
  },
  {
    name: 'too-large estimate is not consumed',
    line: 'renovate house ~200h',
    expected: { title: 'renovate house ~200h', estimateMin: null },
  },
  {
    name: 'a tilde inside a word is not an estimate',
    line: 'approx~20 units left',
    expected: { title: 'approx~20 units left', estimateMin: null },
  },
  {
    name: 'repeated estimates: last one wins',
    line: 'tidy garage ~10m ~20m',
    expected: { title: 'tidy garage', estimateMin: 20 },
  },
  {
    name: 'repeated energy: last one wins',
    line: 'move boxes !low !high',
    expected: { title: 'move boxes', energy: 'high' },
  },
  {
    name: 'several contexts accumulate in order',
    line: 'buy screws @shop @hardware-store',
    expected: { title: 'buy screws', contexts: ['shop', 'hardware-store'] },
  },
  {
    name: 'duplicate contexts de-duplicate case-insensitively',
    line: 'pick up parcel @Shop @shop',
    expected: { title: 'pick up parcel', contexts: ['Shop'] },
  },
  {
    name: 'context trailing punctuation is stripped',
    line: 'call the bank @phone.',
    expected: { title: 'call the bank', contexts: ['phone'] },
  },
  {
    name: 'today',
    line: 'pay the invoice today',
    expected: { title: 'pay the invoice', deferUntil: '2026-10-23' },
  },
  {
    name: 'tomorrow',
    line: 'buy paint tomorrow',
    expected: { title: 'buy paint', deferUntil: '2026-10-24' },
  },
  {
    name: 'bare weekday equal to today means today',
    line: 'review sprint fri',
    expected: { title: 'review sprint', deferUntil: '2026-10-23' },
  },
  {
    name: 'next weekday equal to today means a week later',
    line: 'review sprint next fri',
    expected: { title: 'review sprint', deferUntil: '2026-10-30' },
  },
  {
    name: 'bare weekday resolves to the next occurrence',
    line: 'plan week mon',
    expected: { title: 'plan week', deferUntil: '2026-10-26' },
  },
  {
    name: 'weekday long form',
    line: 'visit grandma sunday',
    expected: { title: 'visit grandma', deferUntil: '2026-10-25' },
  },
  {
    name: 'weekday at the start of a title is a word, not a date',
    line: 'Friday night plan',
    expected: { title: 'Friday night plan', deferUntil: null },
  },
  {
    name: 'weekday followed by a noun stays in the title',
    line: 'Monday standup notes tomorrow',
    expected: { title: 'Monday standup notes', deferUntil: '2026-10-24' },
  },
  {
    name: 'weekday followed by more text is left alone',
    line: 'mon call plumber',
    expected: { title: 'mon call plumber', deferUntil: null },
  },
  {
    name: 'weekday with trailing punctuation still resolves',
    line: 'review sprint fri.',
    expected: { title: 'review sprint', deferUntil: '2026-10-23' },
  },
  {
    name: 'next weekday resolves anywhere in the line',
    line: 'next mon plan the week',
    expected: { title: 'plan the week', deferUntil: '2026-10-26' },
  },
  {
    name: 'in N days',
    line: 'renew domain in 3 days',
    expected: { title: 'renew domain', deferUntil: '2026-10-26' },
  },
  {
    name: 'in N weeks',
    line: 'service boiler in 2 weeks',
    expected: { title: 'service boiler', deferUntil: '2026-11-06' },
  },
  {
    name: 'ISO date',
    line: 'file taxes 2026-11-03',
    expected: { title: 'file taxes', deferUntil: '2026-11-03' },
  },
  {
    name: 'invalid ISO date is not consumed',
    line: 'file taxes 2026-02-31',
    expected: { title: 'file taxes 2026-02-31', deferUntil: null },
  },
  {
    name: 'possessive tomorrow is not a date',
    line: "plan tomorrow's call",
    expected: { title: "plan tomorrow's call", deferUntil: null },
  },
  {
    name: 'repeated date phrases: last one wins',
    line: 'move the bin tomorrow in 3 days',
    expected: { title: 'move the bin', deferUntil: '2026-10-26' },
  },
  {
    name: 'only tokens falls back to the raw line',
    line: '#life ~20m !high',
    expected: { title: '#life ~20m !high', domainId: DOMAIN_SEED_IDS.lifeAdmin, estimateMin: 20, energy: 'high' },
  },
  {
    name: 'unicode and emoji survive in the title',
    line: '— café ☕ with Ana #life',
    expected: { title: '— café ☕ with Ana', domainId: DOMAIN_SEED_IDS.lifeAdmin },
  },
  {
    name: 'empty line yields an empty title',
    line: '',
    expected: { title: '', domainId: null, estimateMin: null, energy: null, deferUntil: null, contexts: [] },
  },
  {
    name: 'whitespace-only line collapses to an empty title',
    line: '   \t  ',
    expected: { title: '' },
  },
  {
    name: 'title is capped at 200 characters',
    line: `a ${'very '.repeat(60)}long line`,
    expected: { title: `a ${'very '.repeat(60)}long line`.slice(0, 200).trimEnd() },
  },
  {
    name: 'an injected clock is respected',
    line: 'call tomorrow',
    now: new Date(2026, 11, 31, 23, 59),
    expected: { title: 'call', deferUntil: '2027-01-01', today: '2026-12-31' },
  },
];

describe('parseCapture', () => {
  for (const testCase of CASES) {
    it(testCase.name, () => {
      const result = parseCapture(testCase.line, {
        now: testCase.now ?? BASE.now,
        domains: testCase.domains ?? BASE.domains,
      });
      expect(result).toMatchObject(testCase.expected);
      expect(result.raw).toBe(testCase.line);
      expect(result.today).toBe(testCase.expected.today ?? '2026-10-23');
    });
  }

  it('works without a domain list: every tag is unknown and stays in the title', () => {
    const result = parseCapture('fix hose #life', { now: NOW });
    expect(result.domainId).toBeNull();
    expect(result.unknownDomainTags).toEqual(['#life']);
    expect(result.title).toBe('fix hose #life');
  });

  it('does not mutate the injected domains or clock', () => {
    const domains = [...DOMAINS];
    const now = new Date(NOW);
    parseCapture('#life tomorrow', { now, domains });
    expect(domains).toEqual(DOMAINS);
    expect(now.getTime()).toBe(NOW.getTime());
  });
});
