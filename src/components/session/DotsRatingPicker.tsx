'use client';

import React from 'react';
import type { Rating } from '@/lib/schemas/session';

interface Props {
  value: Rating | null;
  onChange: (r: Rating) => void;
}

export function DotsRatingPicker({ value, onChange }: Props) {
  const current = value ?? 3;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-text-muted text-sm">Rating</span>
        <span className="font-serif text-2xl text-accent leading-none">
          {value ?? '—'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`Rate ${n}`}
            aria-pressed={value === n}
            className={`w-8 h-8 rounded-full border-2 transition-colors ${
              n <= current
                ? 'bg-accent border-accent'
                : 'bg-surface-2 border-border'
            }`}
          />
        ))}
      </div>
    </div>
  );
}