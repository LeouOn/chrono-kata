import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JOURNAL_TEMPLATE,
  JOURNAL_TEMPLATE_MAX,
  importJournalTemplate,
  normaliseJournalText,
  normaliseMultiline,
  renderJournalTemplate,
  resolveJournalTemplate,
} from '@/lib/journal/template';

const DOMAINS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Trading' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Practice' },
];

const CONTEXT = { date: '2026-06-15', weekday: 'Monday', domains: DOMAINS };

describe('renderJournalTemplate', () => {
  it('substitutes the date, the weekday and the domain checklist', () => {
    const out = renderJournalTemplate('## {{date}} {{weekday}}\n{{domains}}', CONTEXT);
    expect(out).toBe('## 2026-06-15 Monday\n- [ ] Trading\n- [ ] Practice');
  });

  it('leaves unknown placeholders exactly as written', () => {
    const out = renderJournalTemplate('{{date}} {{mood}} {{Date}}', CONTEXT);
    expect(out).toBe('2026-06-15 {{mood}} {{Date}}');
  });

  it('renders every occurrence and an empty domain list without leftovers', () => {
    const out = renderJournalTemplate('{{date}} / {{date}} / [{{domains}}]', {
      ...CONTEXT,
      domains: [],
    });
    expect(out).toBe('2026-06-15 / 2026-06-15 / []');
  });

  it('is deterministic: the same context always produces the same bytes', () => {
    const first = renderJournalTemplate(DEFAULT_JOURNAL_TEMPLATE, CONTEXT);
    expect(renderJournalTemplate(DEFAULT_JOURNAL_TEMPLATE, CONTEXT)).toBe(first);
    expect(first).toContain('- [ ] Trading');
    expect(first).toContain('## 2026-06-15');
  });
});

describe('normalising persisted text', () => {
  it('normalises line endings and trailing blank lines, but keeps content', () => {
    expect(normaliseMultiline('a\r\nb\rc  \n\n')).toBe('a\nb\nc  ');
  });

  it('refuses text that is longer than the field stores instead of truncating it', () => {
    const tooLong = normaliseJournalText('x'.repeat(5001));
    expect(tooLong.ok).toBe(false);
    const atBound = normaliseJournalText('x'.repeat(5000));
    expect(atBound).toEqual({ ok: true, value: 'x'.repeat(5000) });
  });

  it('measures the bound on the normalised value', () => {
    // 5000 characters, but CRLF line endings would make it 5,100 bytes.
    const text = `${'x'.repeat(4998)}\r\n`;
    expect(normaliseJournalText(text).ok).toBe(true);
  });
});

describe('importJournalTemplate', () => {
  it('imports markdown, normalising line endings and trimming the ends', () => {
    expect(importJournalTemplate('\r\n# Mine\r\n\r\n- {{date}}\r\n\r\n')).toEqual({
      ok: true,
      value: '# Mine\n\n- {{date}}',
    });
  });

  it('refuses an empty file rather than replacing the template with nothing', () => {
    expect(importJournalTemplate('   \n\n').ok).toBe(false);
  });

  it('refuses a file above the template bound', () => {
    expect(importJournalTemplate('y'.repeat(JOURNAL_TEMPLATE_MAX + 1)).ok).toBe(false);
  });
});

describe('resolveJournalTemplate', () => {
  it('falls back to the default for an absent or blank stored value', () => {
    expect(resolveJournalTemplate(undefined)).toBe(DEFAULT_JOURNAL_TEMPLATE);
    expect(resolveJournalTemplate(null)).toBe(DEFAULT_JOURNAL_TEMPLATE);
    expect(resolveJournalTemplate('   \n')).toBe(DEFAULT_JOURNAL_TEMPLATE);
  });

  it('uses the stored template as it is', () => {
    expect(resolveJournalTemplate('# Mine\n{{date}}')).toBe('# Mine\n{{date}}');
  });
});
