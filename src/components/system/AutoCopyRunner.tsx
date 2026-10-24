'use client';

import { useEffect } from 'react';
import { useFlag } from '@/hooks/useFlags';
import { makeDailyCopyIfDue } from '@/lib/copies/copies';

/**
 * Makes the day's automatic copy once the app is idle (roadmap Wave 18 part 4, behind `taskInbox`).
 * Side-effect only, renders nothing. It waits for the browser to be idle so it never competes with the
 * first paint or a running session, and looks again when the tab comes back to the front, so an app left
 * open past midnight still gets its day's copy. With the flag off it does nothing and opens nothing.
 */
export function AutoCopyRunner() {
  const enabled = useFlag('taskInbox');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let handle: number | undefined;
    let usingIdle = false;

    const schedule = () => {
      if (cancelled) return;
      const run = () => {
        if (!cancelled) void makeDailyCopyIfDue();
      };
      if (typeof window.requestIdleCallback === 'function') {
        usingIdle = true;
        handle = window.requestIdleCallback(run, { timeout: 15_000 });
      } else {
        usingIdle = false;
        handle = window.setTimeout(run, 5_000);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule();
    };

    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (handle !== undefined) {
        if (usingIdle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(handle);
        else window.clearTimeout(handle);
      }
    };
  }, [enabled]);

  return null;
}
