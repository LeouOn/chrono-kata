'use client';

import { motion } from 'motion/react';
import { STANDARD_COACH_PERSONALITIES, type CoachPersonality } from '@/lib/schemas/coach-personality';

const PREVIEWS: Record<CoachPersonality, string> = {
  zen: 'Stillness is the practice. Show up.',
  hype: "Let's GO. 30 minutes of full presence!",
  analyst: 'Pattern logged. Variance noted.',
  buddy: 'Nice — glad you carved out the time.',
  athena: '…',  // not shown in onboarding
};

const COLORS: Record<CoachPersonality, string> = {
  zen: 'var(--color-zen)',
  hype: 'var(--color-hype)',
  analyst: 'var(--color-analyst)',
  buddy: 'var(--color-buddy)',
  athena: 'var(--color-athena-from)',
};

const LABELS: Record<CoachPersonality, string> = {
  zen: 'Zen',
  hype: 'Hype',
  analyst: 'Analyst',
  buddy: 'Buddy',
  athena: 'Athena',
};

export function PersonalityPicker({ onSelect }: { onSelect: (p: CoachPersonality) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 mt-6">
      {STANDARD_COACH_PERSONALITIES.map((p) => (
        <motion.button
          key={p}
          onClick={() => onSelect(p)}
          whileTap={{ scale: 0.96 }}
          className="rounded-2xl border border-border bg-surface p-4 text-left hover:border-accent transition-colors"
          style={{ borderColor: undefined }}
        >
          <div
            className="w-3 h-3 rounded-full mb-2"
            style={{ backgroundColor: COLORS[p] }}
            aria-hidden
          />
          <div className="font-serif text-xl text-text mb-1">{LABELS[p]}</div>
          <div className="text-sm text-text-muted italic">"{PREVIEWS[p]}"</div>
        </motion.button>
      ))}
    </div>
  );
}
