'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { settingsRepo } from '@/lib/db/settings.repo';

const REQUIRED_TAPS = 7;
const WINDOW_MS = 5000;

interface Options {
  onUnlock?: () => void;
}

/**
 * Tracks rapid taps. Returns a `registerTap` function that the consumer calls
 * on each tap; triggers unlock when REQUIRED_TAPS accumulate within WINDOW_MS.
 *
 * Side effect: writes 'athena' into settings.unlockedPersonalities and
 * invalidates the ['settings'] query so UI subscribers re-render.
 */
export function useAthenaUnlock({ onUnlock }: Options = {}) {
  const tapsRef = useRef<number[]>([]);
  const qc = useQueryClient();

  const registerTap = useCallback(async () => {
    const now = Date.now();
    // Prune taps outside the rolling window.
    tapsRef.current = tapsRef.current.filter((t) => now - t < WINDOW_MS);
    tapsRef.current.push(now);

    if (tapsRef.current.length >= REQUIRED_TAPS) {
      tapsRef.current = [];
      // Read current settings, check if already unlocked.
      const current = await settingsRepo.get();
      if (current.unlockedPersonalities.includes('athena')) {
        return; // already unlocked
      }
      await settingsRepo.patch({
        unlockedPersonalities: [...current.unlockedPersonalities, 'athena'],
      });
      qc.invalidateQueries({ queryKey: ['settings'] });
      onUnlock?.();
    }
  }, [onUnlock, qc]);

  return { registerTap };
}
