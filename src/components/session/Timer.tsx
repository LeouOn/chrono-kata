'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, RotateCcw, Bell, BellOff } from 'lucide-react';
import {
  playPracticeSound,
  playIntervalPing,
  type SoundType,
} from '@/lib/audio/bell-synthesizer';

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
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [bellSound, setBellSound] = useState<SoundType>('tibetan_bowl');
  const [intervalMinutes, setIntervalMinutes] = useState<number>(0); // 0 = off
  const [soundControlsOpen, setSoundControlsOpen] = useState(false);

  const rafRef = useRef<number | null>(null);
  const lastIntervalPingRef = useRef<number>(0);

  useEffect(() => {
    if (!startedAt) {
      lastIntervalPingRef.current = 0;
      return;
    }
    const tick = () => {
      const currentNow = Date.now();
      setNow(currentNow);

      // Check interval chime if configured
      if (audioEnabled && intervalMinutes > 0) {
        const elapsedSec = Math.floor((currentNow - startedAt.getTime()) / 1000);
        const intervalSec = intervalMinutes * 60;
        const currentIntervalBucket = Math.floor(elapsedSec / intervalSec);

        if (currentIntervalBucket > 0 && currentIntervalBucket > lastIntervalPingRef.current) {
          lastIntervalPingRef.current = currentIntervalBucket;
          playIntervalPing({ volume: 0.6 });
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startedAt, audioEnabled, intervalMinutes]);

  function handleStart() {
    if (audioEnabled) {
      playPracticeSound(bellSound, { volume: 0.7 });
    }
    onStart();
  }

  function handleStop() {
    const elapsed = startedAt ? Date.now() - startedAt.getTime() : 0;
    if (audioEnabled) {
      playPracticeSound(bellSound, { volume: 0.75 });
    }
    onStop(Math.max(1, Math.round(elapsed / 60000)));
  }

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

      {/* Main Timer Controls */}
      <div className="flex items-center gap-2">
        {!startedAt ? (
          <button
            type="button"
            onClick={handleStart}
            className="flex items-center gap-2 bg-accent text-base px-6 py-2.5 rounded-full font-medium shadow-md shadow-accent/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Play size={18} fill="currentColor" /> Start
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStop}
            className="flex items-center gap-2 bg-hype text-base px-6 py-2.5 rounded-full font-medium shadow-md shadow-hype/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Pause size={18} fill="currentColor" /> Stop
          </button>
        )}

        <button
          type="button"
          onClick={onReset}
          disabled={!startedAt}
          className="flex items-center justify-center w-11 h-11 bg-surface-2 text-text rounded-full disabled:opacity-40 hover:bg-surface active:scale-95 transition-all"
          title="Reset timer"
          aria-label="Reset timer"
        >
          <RotateCcw size={17} />
        </button>

        <button
          type="button"
          onClick={() => setSoundControlsOpen((prev) => !prev)}
          className={`flex items-center justify-center w-11 h-11 rounded-full transition-all ${
            audioEnabled
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'bg-surface-2 text-text-muted hover:text-text'
          }`}
          title="Sound & Bell Settings"
          aria-label="Sound & Bell Settings"
        >
          {audioEnabled ? <Bell size={17} /> : <BellOff size={17} />}
        </button>
      </div>

      {/* Sound Settings Drawer */}
      {soundControlsOpen && (
        <div className="w-full max-w-xs mt-2 p-3 bg-surface-2/80 backdrop-blur rounded-2xl border border-border text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-text">Meditation Chimes</span>
            <button
              type="button"
              onClick={() => setAudioEnabled((prev) => !prev)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                audioEnabled ? 'bg-accent text-base' : 'bg-surface text-text-muted'
              }`}
            >
              {audioEnabled ? 'Enabled' : 'Muted'}
            </button>
          </div>

          {audioEnabled && (
            <>
              {/* Bell Sound Selection */}
              <div>
                <label className="text-text-muted block mb-1">Bell Tone</label>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'tibetan_bowl', label: 'Bowl' },
                      { id: 'temple_bell', label: 'Temple' },
                      { id: 'woodblock', label: 'Block' },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setBellSound(s.id);
                        playPracticeSound(s.id, { volume: 0.7 });
                      }}
                      className={`py-1.5 px-2 rounded-lg text-center font-medium transition-colors ${
                        bellSound === s.id
                          ? 'bg-accent text-base'
                          : 'bg-surface text-text-muted hover:text-text'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interval Chime Selection */}
              <div>
                <label className="text-text-muted block mb-1">Interval Reminder</label>
                <div className="grid grid-cols-4 gap-1">
                  {[0, 5, 10, 15].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setIntervalMinutes(mins)}
                      className={`py-1.5 px-1.5 rounded-lg text-center font-medium transition-colors ${
                        intervalMinutes === mins
                          ? 'bg-accent text-base'
                          : 'bg-surface text-text-muted hover:text-text'
                      }`}
                    >
                      {mins === 0 ? 'None' : `${mins}m`}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
