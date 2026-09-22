'use client';

import { motion } from 'motion/react';
import type { Session } from '@/lib/schemas/session';
import { formatSessionSummary } from '@/lib/utils/format';
import type { CoachPersonality } from '@/lib/schemas/coach-personality';
import { useSettings } from '@/hooks/useSettings';
import { RatingMark } from './RatingMark';

const PERSONALITY_COLORS: Record<CoachPersonality, string> = {
  zen: 'var(--color-zen)',
  hype: 'var(--color-hype)',
  analyst: 'var(--color-analyst)',
  buddy: 'var(--color-buddy)',
  athena: 'var(--color-athena-from)',
};

interface Props {
  session: Session;
  onClick?: (s: Session) => void;
  onRetry?: (s: Session) => void;
  pending?: boolean;
}

export function SessionCard({ session, onClick, onRetry, pending }: Props) {
  const { settings } = useSettings();
  const time = session.startedAt.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  const ageMs = Date.now() - session.createdAt.getTime();
  const isThinkingCoach =
    !session.coachComment && !session.failedLLM && ageMs < 60_000;
  const personalityColor =
    PERSONALITY_COLORS[session.coachPersonalityAtGeneration ?? 'buddy'];

  return (
    <motion.button
      layout
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick?.(session)}
      className="w-full text-left flex items-start gap-3 py-3"
    >
      <div className="shrink-0 pt-0.5">
        <RatingMark rating={session.rating} emoji={settings?.ratingStyle === 'emoji'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">{time}</span>
          <span className="text-text font-medium truncate">
            {formatSessionSummary(session)}
          </span>
          {pending && (
            <span className="text-xs text-accent animate-pulse">syncing…</span>
          )}
        </div>
        {session.note && (
          <div className="text-text-muted text-sm truncate mt-0.5">{session.note}</div>
        )}
        {isThinkingCoach && (
          <div className="mt-2 text-xs text-text-muted italic animate-pulse border-l-2 border-text-muted pl-2">
            Coach is thinking…
          </div>
        )}
        {session.coachComment && (
          <div
            className="mt-2 text-xs italic text-text-muted border-l-2 pl-2"
            style={{ borderColor: personalityColor }}
          >
            {session.coachComment}
          </div>
        )}
        {session.failedLLM && !session.coachComment && ageMs >= 60_000 && (
          <div className="mt-2 text-xs text-hype border-l-2 border-hype pl-2 flex items-center gap-2">
            <span>Coach unavailable.</span>
            {onRetry && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(session);
                }}
                className="underline hover:text-accent transition-colors"
              >
                ↻ Retry
              </button>
            )}
          </div>
        )}
      </div>
    </motion.button>
  );
}
