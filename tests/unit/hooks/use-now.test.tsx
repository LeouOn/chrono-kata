import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNow } from '@/hooks/useNow';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 10, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances with the clock without any other event', () => {
    const { result, unmount } = renderHook(() => useNow(30_000));
    expect(result.current).toBe(new Date(2026, 5, 15, 10, 0, 0).getTime());
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(new Date(2026, 5, 15, 10, 0, 30).getTime());
    unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refreshes on focus', () => {
    const { result } = renderHook(() => useNow(30_000));
    vi.setSystemTime(new Date(2026, 5, 15, 10, 5, 0));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe(new Date(2026, 5, 15, 10, 5, 0).getTime());
  });
});
