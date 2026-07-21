'use client';

import { motion } from 'motion/react';
import type { Rating } from '@/lib/schemas/session';

const OPTIONS: { value: Rating; emoji: string; label: string }[] = [
  { value: 5, emoji: '😄', label: 'Great' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 3, emoji: '😐', label: 'OK' },
  { value: 2, emoji: '😕', label: 'Meh' },
  { value: 1, emoji: '😢', label: 'Poor' },
];

interface Props {
  value: Rating | null;
  onChange: (r: Rating) => void;
}

export function RatingPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <motion.button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            whileTap={{ scale: 0.9 }}
            className={`flex flex-col items-center gap-1 py-2 rounded-2xl border transition-colors ${
              selected
                ? 'border-accent bg-accent/10'
                : 'border-border bg-surface-2'
            }`}
            aria-label={o.label}
            aria-pressed={selected}
          >
            <span className={`text-2xl ${selected ? '' : 'opacity-50'}`}>{o.emoji}</span>
            <span className={`text-xs ${selected ? 'text-accent' : 'text-text-muted'}`}>
              {o.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
