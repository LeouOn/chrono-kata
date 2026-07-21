'use client';

import { motion } from 'motion/react';
import type { Session } from '@/lib/schemas/session';
import { formatSessionSummary } from '@/lib/utils/format';

const RATING_EMOJI: Record<number, string> = {
  5: '😄', 4: '🙂', 3: '😐', 2: '😕', 1: '😢',
};

interface Props {
  session: Session;
  onClick?: (s: Session) => void;
  pending?: boolean;
}

export function SessionCard({ session, onClick, pending }: Props) {
  const time = session.startedAt.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <motion.button
      layout
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick?.(session)}
      className="w-full text-left flex items-start gap-3 py-3"
    >
      <div className="text-2xl shrink-0" aria-hidden>
        {RATING_EMOJI[session.rating]}
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
          <div className="text-text-muted text-sm truncate mt-0.5">
            {session.note}
          </div>
        )}
        {session.coachComment && (
          <div className="mt-2 text-xs italic text-text-muted border-l-2 border-accent pl-2">
            {session.coachComment}
          </div>
        )}
      </div>
    </motion.button>
  );
}
