import React from 'react';
import { Star } from 'lucide-react';

const RATING_EMOJI: Record<number, string> = {
  5: '😄',
  4: '🙂',
  3: '😐',
  2: '😕',
  1: '😢',
};

interface Props {
  rating: number;
  emoji: boolean;
  size?: 'md' | 'lg';
}

export function RatingMark({ rating, emoji, size = 'md' }: Props) {
  if (emoji) {
    return (
      <span className={size === 'lg' ? 'text-4xl leading-none' : 'text-2xl leading-none'} aria-hidden>
        {RATING_EMOJI[rating] ?? '—'}
      </span>
    );
  }

  const starSize = size === 'lg' ? 28 : 14;
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0" aria-label={`${rating} out of 5 stars`}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <Star
          key={n}
          size={starSize}
          strokeWidth={1.75}
          aria-hidden
          className={n <= rating ? 'text-accent fill-accent' : 'text-border'}
        />
      ))}
    </span>
  );
}
