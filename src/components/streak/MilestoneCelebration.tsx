'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MILESTONE_EVENT } from '@/lib/streak/milestones';

const COPY: Record<number, string> = {
  3: 'Three days. The shape is forming.',
  7: 'Seven days. One full week — the path finds its rhythm.',
  14: 'Fourteen days. Practice becomes pattern.',
  30: 'Thirty days. A month of showing up.',
  60: 'Sixty days. The arc is unmistakable.',
  90: 'Ninety days. A season of practice.',
  180: 'Half a year. The practice is you.',
  365: 'A full year. The first step was the whole path.',
};

const CONFETTI_COUNT = 40;
const CONFETTI_COLORS = ['#F5A623', '#9CAF88', '#E85D75', '#6BB7D9', '#E6C99A'];

interface ConfettiPiece {
  id: number;
  x: number; // vw starting position
  delay: number;
  duration: number;
  color: string;
  rotate: number;
}

function makeConfetti(): ConfettiPiece[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.3,
    duration: 1.6 + Math.random() * 1.4,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
    rotate: Math.random() * 720,
  }));
}

export function MilestoneCelebration() {
  const [milestone, setMilestone] = useState<number | null>(null);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);

  // Celebrates only when told a save just earned a milestone (see MILESTONE_EVENT). It no longer watches the
  // streak record: a streak that arrives by a restore, a first read or a recompute is not an achievement.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMilestone = (event: Event) => {
      const earned = (event as CustomEvent<{ milestone?: number }>).detail?.milestone;
      if (typeof earned !== 'number' || !Number.isFinite(earned)) return;
      setMilestone(earned);
      setConfetti(makeConfetti());
      // Vibrate (mobile).
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([60, 40, 60, 40, 120]);
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setMilestone(null);
        setConfetti([]);
      }, 4000);
    };
    window.addEventListener(MILESTONE_EVENT, onMilestone);
    return () => {
      window.removeEventListener(MILESTONE_EVENT, onMilestone);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <AnimatePresence>
      {milestone && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-base/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            setMilestone(null);
            setConfetti([]);
          }}
        >
          {/* Confetti */}
          {confetti.map((c) => (
            <motion.div
              key={c.id}
              className="absolute w-2 h-3"
              style={{ backgroundColor: c.color, left: `${c.x}vw`, top: '-5vh' }}
              initial={{ y: 0, rotate: 0, opacity: 1 }}
              animate={{ y: '110vh', rotate: c.rotate, opacity: [1, 1, 0] }}
              transition={{ duration: c.duration, delay: c.delay, ease: 'easeIn' }}
            />
          ))}

          {/* Center text */}
          <motion.div
            className="text-center px-8"
            initial={{ scale: 0.8, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 18 }}
          >
            <div className="text-6xl mb-4">🔥</div>
            <div className="font-serif text-5xl text-accent mb-2">{milestone}</div>
            <div className="text-text-muted uppercase tracking-widest text-sm mb-4">
              day streak
            </div>
            <p className="font-serif text-xl text-text italic max-w-xs mx-auto">
              {COPY[milestone] ?? `${milestone} days. Well done.`}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
