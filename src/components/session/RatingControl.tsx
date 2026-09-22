'use client';

import React from 'react';
import type { Rating } from '@/lib/schemas/session';
import type { RatingStyle } from '@/lib/schemas/settings';
import { DotsRatingPicker } from './DotsRatingPicker';
import { RatingPicker } from './RatingPicker';
import { SliderRatingPicker } from './SliderRatingPicker';
import { StarRatingPicker } from './StarRatingPicker';

interface Props {
  value: Rating | null;
  onChange: (r: Rating) => void;
  style?: RatingStyle;
}

export function RatingControl({ value, onChange, style = 'stars' }: Props) {
  if (style === 'emoji') return <RatingPicker value={value} onChange={onChange} />;
  if (style === 'dots') return <DotsRatingPicker value={value} onChange={onChange} />;
  if (style === 'slider') return <SliderRatingPicker value={value} onChange={onChange} />;
  return <StarRatingPicker value={value} onChange={onChange} />;
}
