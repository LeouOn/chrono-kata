'use client';

import React, { type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';

/**
 * Honour the system's reduced-motion setting for every motion component.
 *
 * `reducedMotion="user"` makes motion/react skip transform and layout
 * animations (opacity still fades) when the person has asked for less motion;
 * the CSS side is handled by the media query in globals.css.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
