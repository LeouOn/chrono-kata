'use client';

import React, { type ButtonHTMLAttributes, forwardRef } from 'react';
import { motion } from 'motion/react';

type Variant = 'primary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-base hover:bg-accent-hover',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  danger: 'bg-transparent text-hype hover:bg-surface-2',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', className = '', children, ...rest },
  ref
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.96 }}
      className={`rounded-2xl px-4 py-3 font-medium transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...(rest as React.ComponentProps<typeof motion.button>)}
    >
      {children}
    </motion.button>
  );
});
