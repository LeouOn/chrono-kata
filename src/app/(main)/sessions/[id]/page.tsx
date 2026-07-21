'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSessions } from '@/hooks/useSessions';
import { SessionForm } from '@/components/session/SessionForm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatDuration } from '@/lib/utils/format';

const RATING_EMOJI: Record<number, string> = {
  5: '😄', 4: '🙂', 3: '😐', 2: '😕', 1: '😢',
};

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { sessions, updateSession, deleteSession } = useSessions();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const session = sessions.find((s) => s.id === params.id);
  if (!session) {
    return (
      <div className="text-text-muted text-sm">
        Session not found.{' '}
        <button onClick={() => router.push('/sessions')} className="text-accent">
          Back to list
        </button>
      </div>
    );
  }

  async function handleDelete() {
    await deleteSession(session!.id);
    setDeleteOpen(false);
    router.push('/sessions');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-4xl">{RATING_EMOJI[session.rating]}</div>
          <h1 className="font-serif text-2xl mt-2">
            {session.durationMinutes != null
              ? formatDuration(session.durationMinutes)
              : `${session.reps} reps`}
          </h1>
          <div className="text-text-muted text-sm">
            {session.startedAt.toLocaleString([], {
              dateStyle: 'long',
              timeStyle: 'short',
            })}
          </div>
        </div>
        {session.activityLabel && (
          <span className="text-xs bg-surface-2 px-3 py-1 rounded-full text-text-muted">
            {session.activityLabel}
          </span>
        )}
      </div>

      {session.note && (
        <Card>
          <div className="text-xs uppercase tracking-wide text-text-muted mb-2">Note</div>
          <p className="text-text whitespace-pre-wrap">{session.note}</p>
        </Card>
      )}

      {session.coachComment && (
        <Card>
          <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
            Coach
          </div>
          <p className="text-text italic whitespace-pre-wrap border-l-2 border-accent pl-3">
            {session.coachComment}
          </p>
        </Card>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="ghost" onClick={() => setEditOpen(true)}>Edit</Button>
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete</Button>
      </div>

      <SessionForm
        open={editOpen}
        initial={session}
        onSave={async (input) => {
          await updateSession({ id: session.id, patch: input });
          setEditOpen(false);
        }}
        onCancel={() => setEditOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete session?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
