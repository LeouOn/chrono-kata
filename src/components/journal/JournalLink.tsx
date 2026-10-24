'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { useFlag } from '@/hooks/useFlags';
import { useJournalDay } from '@/hooks/useJournal';
import { useTodayKey } from '@/hooks/usePlanning';
import { formatLongDate } from '@/lib/journal/export';

/**
 * The journal's entry point on Home, behind `taskInbox`. With a closed day it
 * says so; with an open one it invites the evening, without nudging.
 */
export function JournalLink() {
  const enabled = useFlag('taskInbox');
  const dayKey = useTodayKey();
  const { data: plan } = useJournalDay(dayKey, { enabled });
  if (!enabled) return null;

  const closed = plan?.shutdownAt != null;
  return (
    <Link
      href="/journal"
      className="flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
      aria-label={closed ? 'Open today’s journal, the day is closed' : 'Open today’s journal'}
    >
      <BookOpen size={18} strokeWidth={2} aria-hidden className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-base text-text">Journal</span>
        <span className="block text-xs text-text-muted">
          {closed ? 'The day is closed. The entry stays editable.' : 'Write the day down, close it gently.'}
        </span>
      </span>
      <span className="shrink-0 text-xs text-text-muted">{formatLongDate(dayKey)}</span>
    </Link>
  );
}
