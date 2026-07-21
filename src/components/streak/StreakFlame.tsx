'use client';

import { motion } from 'motion/react';

interface Props {
  days: number;
  onTap?: () => void;
}

export function StreakFlame({ days, onTap }: Props) {
  return (
    <motion.button
      onClick={onTap}
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
  );
}
