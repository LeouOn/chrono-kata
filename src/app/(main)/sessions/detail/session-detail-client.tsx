'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Share2, Copy, Download, FileText } from 'lucide-react';
import { useSessions } from '@/hooks/useSessions';
import { useConversation } from '@/hooks/useConversation';
import { useSettings } from '@/hooks/useSettings';
import { SessionForm } from '@/components/session/SessionForm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConversationThread } from '@/components/session/ConversationThread';
import { FollowUpInput } from '@/components/session/FollowUpInput';
import { formatDuration } from '@/lib/utils/format';
import { toLocalDateString } from '@/lib/utils/date';
import { RatingMark } from '@/components/session/RatingMark';
import { dispatchToast } from '@/components/ui/Toast';
import {
  exportConversationAsJson,
  exportConversationAsMarkdown,
  downloadFile,
  copyToClipboard,
} from '@/lib/utils/conversation-export';

export function SessionDetailClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('id');
  const router = useRouter();
  const { sessions, updateSession, deleteSession } = useSessions();
  const { settings, updateSettings } = useSettings();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const session = sessions.find((s) => s.id === sessionId);
  // Keep all hooks above the early return: on hard loads the sessions query
  // starts empty, so hook order must not change between renders.
  const {
    conversation,
    messages,
    branchMap,
    isLoading,
    isStreaming,
    sendMessage,
    regenerateMessage,
    editMessage,
    deleteMessage,
    switchBranch,
  } = useConversation(session?.conversationId ?? null);
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

  async function handleDelete(dontAskAgain: boolean) {
    try {
      if (dontAskAgain) await updateSettings({ confirmSessionDelete: false });
      await deleteSession(session!.id);
      setDeleteOpen(false);
      router.push('/sessions');
    } catch (e) {
      dispatchToast(e instanceof Error ? e.message : 'Failed to delete session', 'error');
      setDeleteOpen(false);
    }
  }

  function handleDeleteClick() {
    if (settings?.confirmSessionDelete === false) {
      void handleDelete(false);
    } else {
      setDeleteOpen(true);
    }
  }

  async function handleCopyMarkdown() {
    if (!conversation) return;
    const md = exportConversationAsMarkdown(session!, conversation, messages);
    const ok = await copyToClipboard(md);
    if (ok) {
      dispatchToast('Conversation copied to clipboard as Markdown!', 'success');
    } else {
      dispatchToast('Failed to copy to clipboard', 'error');
    }
    setExportOpen(false);
  }

  function handleDownloadMarkdown() {
    if (!conversation) return;
    const md = exportConversationAsMarkdown(session!, conversation, messages);
    const dateTag = toLocalDateString(session!.startedAt);
    downloadFile(md, `chrono-kata-${dateTag}-${session!.id.slice(0, 8)}.md`, 'text/markdown');
    dispatchToast('Downloaded Markdown export', 'success');
    setExportOpen(false);
  }

  function handleDownloadJson() {
    if (!conversation) return;
    const jsonStr = exportConversationAsJson(session!, conversation, messages);
    const dateTag = toLocalDateString(session!.startedAt);
    downloadFile(jsonStr, `chrono-kata-${dateTag}-${session!.id.slice(0, 8)}.json`, 'application/json');
    dispatchToast('Downloaded JSON export', 'success');
    setExportOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <RatingMark rating={session.rating} emoji={settings?.ratingStyle === 'emoji'} size="lg" />
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

      {conversation ? (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase tracking-wide text-text-muted">
              Coach thread
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportOpen((prev) => !prev)}
                className="text-xs text-text-muted hover:text-text px-2 py-1 rounded bg-surface-2 hover:bg-surface flex items-center gap-1.5 transition-colors"
                title="Export conversation"
              >
                <Share2 size={13} />
                <span>Export</span>
              </button>

              {exportOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-surface-2 border border-border rounded-xl shadow-lg p-1.5 z-20 space-y-1 text-xs">
                  <button
                    type="button"
                    onClick={handleCopyMarkdown}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface text-text flex items-center gap-2"
                  >
                    <Copy size={13} className="text-text-muted" />
                    <span>Copy Markdown</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadMarkdown}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface text-text flex items-center gap-2"
                  >
                    <FileText size={13} className="text-text-muted" />
                    <span>Download (.md)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadJson}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface text-text flex items-center gap-2"
                  >
                    <Download size={13} className="text-text-muted" />
                    <span>Download (.json)</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="text-text-muted text-sm italic py-4 text-center animate-pulse">
              Loading…
            </div>
          ) : (
            <>
              <ConversationThread
                messages={messages}
                branchMap={branchMap}
                isStreaming={isStreaming}
                onRegenerate={(id) => void regenerateMessage(id)}
                onEdit={(id, text) => void editMessage(id, text)}
                onDelete={(id) => void deleteMessage(id)}
                onSwitchBranch={(id) => void switchBranch(id)}
              />
              <FollowUpInput
                disabled={isStreaming}
                onSend={(t, opts) => void sendMessage(t, opts)}
              />
            </>
          )}
        </Card>
      ) : session.coachComment ? (
        <Card>
          <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
            Coach
          </div>
          <p className="text-text italic whitespace-pre-wrap border-l-2 border-accent pl-3">
            {session.coachComment}
          </p>
        </Card>
      ) : null}

      <div className="flex gap-2 pt-2">
        <Button variant="ghost" onClick={() => setEditOpen(true)}>Edit</Button>
        <Button variant="danger" onClick={handleDeleteClick}>Delete</Button>
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
        showDontAskAgain
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}