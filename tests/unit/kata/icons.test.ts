import { describe, it, expect } from 'vitest';
import { KATA_ICON_CATEGORIES, ALL_KATA_ICONS } from '@/lib/kata/icons';

// The original 10 hardcoded choices — existing templates may use any of these.
const LEGACY_ICONS = ['🥋', '🧘', '⚡', '📖', '💻', '🏃', '🎨', '🎯', '🌊', '🔥'];

describe('KATA_ICON_CATEGORIES', () => {
  it('has four non-empty categories with labels', () => {
    expect(KATA_ICON_CATEGORIES.length).toBe(4);
    for (const category of KATA_ICON_CATEGORIES) {
      expect(category.label.length).toBeGreaterThan(0);
      expect(category.icons.length).toBeGreaterThan(0);
    }
  });

  it('has at least 20 icons total', () => {
    expect(ALL_KATA_ICONS.length).toBeGreaterThanOrEqual(20);
  });

  it('has no duplicate icons across categories', () => {
    expect(new Set(ALL_KATA_ICONS).size).toBe(ALL_KATA_ICONS.length);
  });

  it('includes every legacy icon so existing templates stay selectable', () => {
    const set = new Set(ALL_KATA_ICONS);
    for (const icon of LEGACY_ICONS) {
      expect(set.has(icon)).toBe(true);
    }
  });
});
