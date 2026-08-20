'use client';

import { motion } from 'motion/react';
import { Check } from 'lucide-react';

interface Props {
  currentMinutes: number;
  goalMinutes: number;
  size?: number;
  strokeWidth?: number;
}

export function GoalProgressRing({
  currentMinutes,
  goalMinutes,
  size = 56,
  strokeWidth = 5,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeGoal = Math.max(1, goalMinutes);
  const ratio = Math.min(1, currentMinutes / safeGoal);
  const strokeDashoffset = circumference * (1 - ratio);
  const isComplete = currentMinutes >= safeGoal;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        aria-label={`Daily goal: ${currentMinutes} of ${goalMinutes} minutes`}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth={strokeWidth}
        />
        {/* Progress Arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isComplete ? 'var(--color-accent)' : 'var(--color-accent)'}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          strokeLinecap="round"
        />
      </svg>

      {/* Center Display */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {isComplete ? (
          <Check size={16} className="text-accent stroke-[3]" />
        ) : (
          <span className="text-[11px] font-medium text-text tabular-nums leading-none">
            {Math.round((currentMinutes / safeGoal) * 100)}%
          </span>
        )}
      </div>
    </div>
  );
}
