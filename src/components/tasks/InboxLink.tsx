'use client';

import React from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { useFlag } from '@/hooks/useFlags';
import { useInbox } from '@/hooks/useTasks';

/**
 * The single inbox entry point, in the Home header. Rendered only when the
 * `taskInbox` flag is on, and the count is neutral: no red, no overdue wording.
 */
export function InboxLink() {
  const enabled = useFlag('taskInbox');
  // Gate the query itself: with the flag off the Home page must not read the
  // tasks store at all, not merely hide the link.
  const { count } = useInbox({ enabled });
  if (!enabled) return null;

  return (
    <Link
      href="/inbox"
      className="flex items-center gap-1.5 min-h-11 px-3 rounded-2xl border border-border bg-surface text-sm text-text-muted hover:text-text transition-colors"
      aria-label={count === 1 ? 'Inbox, 1 item to sort' : `Inbox, ${count} items to sort`}
    >
      <Inbox size={16} strokeWidth={2} aria-hidden />
      <span>Inbox</span>
      {count > 0 ? <span className="font-serif text-text">{count}</span> : null}
    </Link>
  );
}
