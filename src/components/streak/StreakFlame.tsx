'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { useAthenaUnlock } from '@/hooks/useAthenaUnlock';
import { AthenaReveal } from '@/components/coach/AthenaReveal';

interface Props {
  days: number;
  /** Optional external tap handler (preserves backwards compatibility). */
  onTap?: () => void;
}

/**
 * Streak flame indicator. Tapping the flame counts toward the Athena 7-tap
 * unlock pattern; tapping 7 times within 5 seconds (when Athena is not yet
 * unlocked) reveals her. An optional external onTap handler is still called
 * for downstream consumers if provided.
 */
export function StreakFlame({ days, onTap }: Props) {
  const [revealOpen, setRevealOpen] = useState(false);
  const { registerTap } = useAthenaUnlock({
    onUnlock: () => setRevealOpen(true),
  });

  return (
    <>
      <motion.button
        onClick={() => {
          onTap?.();
          void registerTap();
        }}
        whileTap={{ scale: 0.95 }}
        className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3"
        aria-label={`${days} day streak`}
      >
        <span className="text-2xl" role="img" aria-hidden>🔥</span>
        <div className="text-left">
          <div className="font-serif text-2xl text-accent leading-none">{days}</div>
          <div className="text-xs text-text-muted">day streak</div>
        </div>
      </motion.button>
      <AthenaReveal open={revealOpen} onClose={() => setRevealOpen(false)} />
    </>
  );
}
