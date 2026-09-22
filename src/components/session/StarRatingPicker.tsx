'use client';

import React from 'react';
import { Star } from 'lucide-react';
import type { Rating } from '@/lib/schemas/session';

const LABELS: Record<Rating, string> = {
  1: 'Poor',
  2: 'Meh',
  3: 'OK',
  4: 'Good',
  5: 'Great',
};

interface Props {
  value: Rating | null;
  onChange: (r: Rating) => void;
}

export function StarRatingPicker({ value, onChange }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between gap-1" role="group" aria-label="Rating">
        {([1, 2, 3, 4, 5] as const).map((n) => {
          const filled = value != null && n <= value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={LABELS[n]}
              aria-pressed={value === n}
              className="flex-1 flex justify-center py-2 rounded-2xl border border-transparent hover:bg-surface-2"
            >
              <Star
                size={28}
                strokeWidth={1.75}
                aria-hidden
                className={filled ? 'text-accent fill-accent' : 'text-text-muted'}
              />
            </button>
          );
        })}
      </div>
      <div className="text-xs text-center text-text-muted mt-1">
        {value ? LABELS[value] : 'Tap a star'}
      </div>
    </div>
  );
}
