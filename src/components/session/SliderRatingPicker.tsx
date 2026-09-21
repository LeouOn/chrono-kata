'use client';

import React from 'react';
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

export function SliderRatingPicker({ value, onChange }: Props) {
  const current = value ?? 3;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-text-muted text-sm">Rating</span>
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-3xl text-accent leading-none">
            {value ?? '—'}
          </span>
          {value && (
            <span className="text-text-muted text-xs uppercase tracking-wide">
              {LABELS[value]}
            </span>
          )}
        </div>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={current}
        onChange={(e) => onChange(Number(e.target.value) as Rating)}
        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-surface-2
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-6
          [&::-webkit-slider-thumb]:h-6
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-accent
          [&::-webkit-slider-thumb]:shadow-md
          [&::-webkit-slider-thumb]:shadow-accent/30
          [&::-webkit-slider-thumb]:cursor-grab
          [&::-webkit-slider-thumb]:active:cursor-grabbing
          [&::-moz-range-thumb]:w-6
          [&::-moz-range-thumb]:h-6
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-accent
          [&::-moz-range-thumb]:border-none
          [&::-moz-range-thumb]:cursor-grab"
        style={{
          background: `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${((current - 1) / 4) * 100}%, var(--color-surface-2) ${((current - 1) / 4) * 100}%, var(--color-surface-2) 100%)`,
        }}
        aria-label="Session rating"
        aria-valuetext={value ? `${value} out of 5, ${LABELS[value]}` : 'No rating selected'}
      />
      <div className="flex justify-between mt-1.5 px-0.5">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`text-xs py-0.5 px-2 rounded-lg font-medium transition-all ${
              value === n ? 'text-accent font-semibold bg-accent/20 border border-accent/40' : 'text-text-muted hover:text-text'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}