'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface Props {
  startedAt: Date | null;
  onStart: () => void;
  onStop: (durationMinutes: number) => void;
  onReset: () => void;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function Timer({ startedAt, onStart, onStop, onReset }: Props) {
  const [now, setNow] = useState(Date.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      setNow(Date.now());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startedAt]);

  const elapsedMs = startedAt ? now - startedAt.getTime() : 0;

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <motion.div
        className="font-serif text-5xl text-accent tabular-nums"
        animate={startedAt ? { scale: [1, 1.01, 1] } : { scale: 1 }}
        transition={{ duration: 2, repeat: startedAt ? Infinity : 0 }}
      >
        {formatElapsed(elapsedMs)}
      </motion.div>
      <div className="flex gap-2">
        {!startedAt ? (
          <button
            type="button"
            onClick={onStart}
            className="flex items-center gap-2 bg-accent text-base px-5 py-2.5 rounded-full font-medium"
          >
            <Play size={18} /> Start
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onStop(Math.max(1, Math.round(elapsedMs / 60000)))}
            className="flex items-center gap-2 bg-hype text-base px-5 py-2.5 rounded-full font-medium"
          >
            <Pause size={18} /> Stop
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          disabled={!startedAt}
          className="flex items-center gap-2 bg-surface-2 text-text px-4 py-2.5 rounded-full disabled:opacity-40"
        >
          <RotateCcw size={18} />
        </button>
      </div>
    </div>
  );
}
