'use client';

import { useEffect, useState } from 'react';

/**
 * A ticking clock. `Date.now()` read during render goes stale: nothing
 * re-renders when a block ends, so "Now until 10:30" would outlive 10:30
 * (roadmap W7 review). One shared hook, ticking every 30 s and immediately on
 * focus/visibility, keeps the Today card and the timeline's now line honest.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', tick);
    };
  }, [intervalMs]);
  return now;
}
