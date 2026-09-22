'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessions } from '@/hooks/useSessions';
import { SessionCard } from '@/components/session/SessionCard';
import { SessionForm } from '@/components/session/SessionForm';
import { groupSessionsByDay } from '@/lib/utils/date';
import type { SessionInput } from '@/lib/schemas/session';

export default function SessionsPage() {
  const router = useRouter();
  const { sessions, createSession, retryCoachComment } = useSessions();
  const [formOpen, setFormOpen] = useState(false);

  const grouped = groupSessionsByDay(sessions);
  const days = Array.from(grouped.keys()).sort().reverse();

  async function handleSave(input: SessionInput) {
    await createSession(input);
    setFormOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl">Sessions</h1>
        <button
          onClick={() => setFormOpen(true)}
          className="bg-accent text-base px-4 py-2 rounded-full text-sm font-medium"
        >
          + New
        </button>
      </div>

      {sessions.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-12 italic">
          No sessions logged yet. The first one is the hardest — and the simplest.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {days.map((day) => (
            <section key={day}>
              <h2 className="text-xs uppercase tracking-wide text-text-muted pt-4 pb-1">
                {formatDayHeading(day)}
              </h2>
              {grouped.get(day)!.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onClick={(sess) => router.push(`/sessions/detail?id=${encodeURIComponent(sess.id)}`)}
                  onRetry={retryCoachComment}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      <SessionForm
        open={formOpen}
        onSave={handleSave}
        onCancel={() => setFormOpen(false)}
      />
    </div>
  );
}

function formatDayHeading(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}
