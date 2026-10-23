import { describe, expect, it } from 'vitest';
import { parseBulk, splitBulk } from '@/lib/capture/split-bulk';
import type { CaptureDomain } from '@/lib/capture/parse-capture';
import { DEFAULT_DOMAINS, DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';

const NOW = new Date(2026, 9, 23, 9, 0);
const DOMAINS: CaptureDomain[] = DEFAULT_DOMAINS.map((d) => ({ id: d.id, name: d.name }));

describe('splitBulk', () => {
  it('splits plain lines and ignores blank lines', () => {
    expect(splitBulk('fix hose\n\nbuy paint\n   \ncall bank\n')).toEqual([
      'fix hose',
      'buy paint',
      'call bank',
    ]);
  });

  it('strips dash, star and bullet markers', () => {
    expect(splitBulk('- fix hose\n* buy paint\n• call bank')).toEqual([
      'fix hose',
      'buy paint',
      'call bank',
    ]);
  });

  it('strips numbered markers in both styles', () => {
    expect(splitBulk('1. fix hose\n2) buy paint\n10. call bank')).toEqual([
      'fix hose',
      'buy paint',
      'call bank',
    ]);
  });

  it('strips checkbox markers, checked or not', () => {
    expect(splitBulk('[ ] fix hose\n[x] buy paint\n[X] call bank')).toEqual([
      'fix hose',
      'buy paint',
      'call bank',
    ]);
  });

  it('strips stacked markers', () => {
    expect(splitBulk('- [ ] fix hose\n1. • buy paint')).toEqual(['fix hose', 'buy paint']);
  });

  it('joins an indented continuation line to the previous item', () => {
    expect(splitBulk('- fix the leak under the sink\n  before the plumber arrives')).toEqual([
      'fix the leak under the sink before the plumber arrives',
    ]);
  });

  it('treats an indented bullet as a new item, not a continuation', () => {
    expect(splitBulk('- fix hose\n  - buy paint')).toEqual(['fix hose', 'buy paint']);
  });

  it('strips trailing commas and semicolons but keeps a sentence period', () => {
    expect(splitBulk('- fix hose;\n- buy paint,\n- call bank.')).toEqual([
      'fix hose',
      'buy paint',
      'call bank.',
    ]);
  });

  it('handles CRLF pastes', () => {
    expect(splitBulk('- fix hose\r\n- buy paint\r\n')).toEqual(['fix hose', 'buy paint']);
  });

  it('returns nothing for empty or whitespace-only input', () => {
    expect(splitBulk('')).toEqual([]);
    expect(splitBulk('  \n\t\n')).toEqual([]);
  });

  it('keeps a hyphen inside a word', () => {
    expect(splitBulk('hardware-store run\n- pick up parcel')).toEqual([
      'hardware-store run',
      'pick up parcel',
    ]);
  });

  it('keeps a leading indentation on the first line as content', () => {
    expect(splitBulk('   fix hose')).toEqual(['fix hose']);
  });
});

describe('parseBulk', () => {
  it('parses each item and keeps stable indices', () => {
    const items = parseBulk(
      ['- fix hose #life ~20m', '* buy paint @shop tomorrow', '1. call bank !low'].join('\n'),
      { now: NOW, domains: DOMAINS },
    );

    expect(items.map((i) => i.index)).toEqual([0, 1, 2]);
    expect(items.map((i) => i.line)).toEqual([
      'fix hose #life ~20m',
      'buy paint @shop tomorrow',
      'call bank !low',
    ]);
    expect(items[0]?.parsed).toMatchObject({
      title: 'fix hose',
      domainId: DOMAIN_SEED_IDS.lifeAdmin,
      estimateMin: 20,
    });
    expect(items[1]?.parsed).toMatchObject({ title: 'buy paint', contexts: ['shop'], deferUntil: '2026-10-24' });
    expect(items[2]?.parsed).toMatchObject({ title: 'call bank', energy: 'low' });
  });

  it('returns an empty array for an empty paste', () => {
    expect(parseBulk('', { now: NOW, domains: DOMAINS })).toEqual([]);
  });
});
