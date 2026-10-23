import { describe, it, expect } from 'vitest';
import { CHARS_PER_TOKEN, estimateTokens, fitToBudget, truncateToBudget } from '@/lib/llm/context-budget';

describe('estimateTokens', () => {
  it('counts roughly four characters per token', () => {
    expect(CHARS_PER_TOKEN).toBe(4);
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('fitToBudget', () => {
  const render = (item: { text: string }) => item.text;

  it('keeps nothing for an empty list', () => {
    const result = fitToBudget([], render, 100);
    expect(result).toEqual({ kept: [], dropped: 0, tokens: 0, truncated: false });
  });

  it('keeps everything that exactly fits the budget', () => {
    const items = [{ text: 'abcd' }, { text: 'efgh' }]; // 1 token each
    const result = fitToBudget(items, render, 2);
    expect(result.kept).toEqual(items);
    expect(result.dropped).toBe(0);
    expect(result.tokens).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('drops the item that does not fit instead of cutting it in half', () => {
    const items = [{ text: 'abcd' }, { text: 'efgh' }, { text: 'ijkl' }]; // 1 token each
    const result = fitToBudget(items, render, 2);
    expect(result.kept).toEqual(items.slice(0, 2));
    expect(result.dropped).toBe(1);
    expect(result.tokens).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('drops one huge item rather than sending half of it', () => {
    const huge = { text: 'x'.repeat(4000) }; // 1000 tokens
    const result = fitToBudget([huge], render, 100);
    expect(result.kept).toEqual([]);
    expect(result.dropped).toBe(1);
    expect(result.tokens).toBe(0);
  });

  it('keeps a small item that comes after a huge one it skipped', () => {
    const items = [{ text: 'x'.repeat(4000) }, { text: 'abcd' }];
    const result = fitToBudget(items, render, 100);
    expect(result.kept).toEqual([{ text: 'abcd' }]);
    expect(result.dropped).toBe(1);
  });

  it('keeps nothing when the budget is zero', () => {
    const result = fitToBudget([{ text: 'abcd' }], render, 0);
    expect(result.kept).toEqual([]);
    expect(result.dropped).toBe(1);
    expect(result.truncated).toBe(true);
  });
});

describe('truncateToBudget', () => {
  it('leaves short text alone', () => {
    expect(truncateToBudget('abcd', 10)).toBe('abcd');
  });

  it('cuts long text down to the budget', () => {
    const cut = truncateToBudget('x'.repeat(100), 2); // 8 characters
    expect(cut.length).toBeLessThanOrEqual(8);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('returns nothing for a zero budget', () => {
    expect(truncateToBudget('abcd', 0)).toBe('');
  });
});
