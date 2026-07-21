'use client';

import { motion } from 'motion/react';
import type { MultiDimRating } from '@/lib/schemas/session';

const PRESETS: Record<'focus' | 'energy' | 'mood', Array<{ value: MultiDimRating; emoji: string; label: string }>> = {
  focus: [
    { value: 1, emoji: '😵‍💫', label: 'Scattered' },
    { value: 2, emoji: '😶', label: 'Distracted' },
    { value: 3, emoji: '😐', label: 'OK' },
    { value: 4, emoji: '🙂', label: 'Focused' },
    { value: 5, emoji: '🎯', label: 'Locked in' },
  ],
  energy: [
    { value: 1, emoji: '🪫', label: 'Drained' },
    { value: 2, emoji: '😴', label: 'Sluggish' },
    { value: 3, emoji: '😐', label: 'Steady' },
    { value: 4, emoji: '⚡', label: 'Energized' },
    { value: 5, emoji: '🚀', label: 'Charged' },
  ],
  mood: [
    { value: 1, emoji: '😢', label: 'Low' },
    { value: 2, emoji: '😕', label: 'Off' },
    { value: 3, emoji: '😐', label: 'Neutral' },
    { value: 4, emoji: '🙂', label: 'Good' },
    { value: 5, emoji: '😄', label: 'Great' },
  ],
};

const TITLES: Record<'focus' | 'energy' | 'mood', string> = {
  focus: 'Focus',
  energy: 'Energy',
  mood: 'Mood',
};

interface Props {
  dimension: 'focus' | 'energy' | 'mood';
  value: MultiDimRating | null | undefined;
  onChange: (v: MultiDimRating | null) => void;
}

export function MultiDimSlider({ dimension, value, onChange }: Props) {
  const preset = PRESETS[dimension];
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-text-muted text-sm">{TITLES[dimension]} (optional)</div>
        {value != null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-text-muted hover:text-text"
          >
            clear
          </button>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {preset.map((o) => {
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
              aria-label={`${TITLES[dimension]}: ${o.label}`}
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
    </div>
  );
}