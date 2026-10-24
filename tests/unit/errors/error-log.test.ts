import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ERROR_LOG_KEY,
  ERROR_LOG_MAX_ENTRIES,
  clearErrorLog,
  exportErrorLogText,
  getErrorLog,
  recordError,
  scrubError,
} from '@/lib/errors/error-log';

beforeEach(() => {
  localStorage.clear();
});

describe('scrubError', () => {
  it('keeps name/message/stack/route/time and nothing else', () => {
    const e = scrubError(new Error('boom'), '/inbox?secret=1', 1234);
    expect(e).toEqual({
      at: 1234,
      route: '/inbox',
      name: 'Error',
      message: 'boom',
      messageTruncated: false,
      stack: expect.stringContaining('Error: boom'),
    });
  });

  it('truncates a long (possibly user-interpolated) message and marks it', () => {
    const userText = 'u'.repeat(500);
    const e = scrubError(new Error(`Task "${userText}" could not be saved`), '/inbox');
    expect(e.message.length).toBeLessThanOrEqual(201); // 200 + ellipsis
    expect(e.messageTruncated).toBe(true);
    expect(e.message.endsWith('…')).toBe(true);
  });

  it('strips the query string from the route (a query can carry user state)', () => {
    expect(scrubError(new Error('x'), '/inbox?tab=2&note=user+text').route).toBe('/inbox');
    expect(scrubError(new Error('x'), '/plan').route).toBe('/plan');
  });

  it('truncates the stack, keeps non-Error values sane', () => {
    const longStack = new Error('x');
    longStack.stack = 's'.repeat(5000);
    const a = scrubError(longStack, '/');
    expect(a.stack.length).toBeLessThanOrEqual(2001);

    const b = scrubError('just a string', '/');
    expect(b.name).toBe('string');
    expect(b.message).toBe('just a string');
    const c = scrubError(undefined, '/');
    expect(c.message).toBe('undefined');
  });
});

describe('ring buffer', () => {
  it('keeps only the newest 50 entries', () => {
    for (let i = 0; i < ERROR_LOG_MAX_ENTRIES + 5; i++) {
      expect(recordError(new Error(`e${i}`), '/r')).toBe(true);
    }
    const log = getErrorLog();
    expect(log).toHaveLength(ERROR_LOG_MAX_ENTRIES);
    expect(log[0]!.message).toBe('e5'); // oldest kept
    expect(log[log.length - 1]!.message).toBe(`e${ERROR_LOG_MAX_ENTRIES + 4}`);
  });

  it('tolerates corrupt stored JSON', () => {
    localStorage.setItem(ERROR_LOG_KEY, '{not json');
    expect(getErrorLog()).toEqual([]);
    expect(recordError(new Error('after corrupt'), '/')).toBe(true);
    expect(getErrorLog()).toHaveLength(1);
  });

  it('drops structurally-invalid entries on read', () => {
    localStorage.setItem(
      ERROR_LOG_KEY,
      JSON.stringify([{ at: 1, route: '/x', message: 'ok', name: 'E', messageTruncated: false, stack: '' }, { junk: true }, 5])
    );
    const log = getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.message).toBe('ok');
  });

  it('never throws when localStorage refuses everything', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(recordError(new Error('boom'), '/')).toBe(false);
    spy.mockRestore();

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('private', 'SecurityError');
    });
    expect(getErrorLog()).toEqual([]);
    getItem.mockRestore();

    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('private', 'SecurityError');
    });
    expect(() => clearErrorLog()).not.toThrow();
    remove.mockRestore();
  });
});

describe('exportErrorLogText', () => {
  it('renders newest first with route, trimmed flag, no user promises', () => {
    recordError(new Error('first'), '/a');
    recordError(new Error('second'), '/b');
    const text = exportErrorLogText();
    const secondAt = text.indexOf('second');
    const firstAt = text.indexOf('first');
    expect(secondAt).toBeGreaterThan(-1);
    expect(firstAt).toBeGreaterThan(secondAt); // newest first
    expect(text).toContain('/a');
    expect(text).toContain('/b');
    expect(text).toContain('kept on this device only');
  });
});
