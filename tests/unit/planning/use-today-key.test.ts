import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTodayKey } from '@/hooks/usePlanning';

afterEach(() => {
  vi.useRealTimers();
});

describe('useTodayKey', () => {
  it('refreshes when the local day rolls over while the app is open', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 5, 15, 23, 59) });
    const { result } = renderHook(() => useTodayKey());
    expect(result.current).toBe('2026-06-15');

    vi.setSystemTime(new Date(2026, 5, 16, 0, 1));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe('2026-06-16');
  });
});
