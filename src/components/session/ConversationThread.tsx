'use client';

import { useState } from 'react';
import {
  RotateCw,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Wrench,
} from 'lucide-react';
import type { CoachPersonality } from '@/lib/schemas/coach-personality';
import type { Message } from '@/lib/schemas/message';
import type { BranchInfo } from '@/hooks/useConversation';

const PERSONALITY_COLORS: Record<CoachPersonality, string> = {
  zen: 'var(--color-zen)',
  hype: 'var(--color-hype)',
  analyst: 'var(--color-analyst)',
  buddy: 'var(--color-buddy)',
  athena: 'var(--color-athena-from)',
};

interface Props {
  messages: Message[];
  branchMap?: Record<string, BranchInfo>;
  isStreaming?: boolean;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onSwitchBranch?: (targetSiblingId: string) => void;
}

export function ConversationThread({
  messages,
  branchMap = {},
  isStreaming = false,
  onRegenerate,
  onEdit,
  onDelete,
  onSwitchBranch,
}: Props) {
  if (messages.length === 0) {
    return (
      <div className="text-text-muted text-sm italic px-1 py-6 text-center">
        No coach response yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          branchInfo={branchMap[m.id]}
          isStreaming={isStreaming}
          onRegenerate={onRegenerate}
          onEdit={onEdit}
          onDelete={onDelete}
          onSwitchBranch={onSwitchBranch}
        />
      ))}
    </div>
  );
}

interface BubbleProps {
  message: Message;
  branchInfo?: BranchInfo;
  isStreaming?: boolean;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onSwitchBranch?: (targetSiblingId: string) => void;
}

function MessageBubble({
  message,
  branchInfo,
  isStreaming,
  onRegenerate,
  onEdit,
  onDelete,
  onSwitchBranch,
}: BubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const handleSaveEdit = () => {
    if (editContent.trim() === '') return;
    onEdit?.(message.id, editContent.trim());
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const isUser = message.role === 'user';
  const color = !isUser ? PERSONALITY_COLORS[message.personality ?? 'buddy'] : undefined;
  const meta = !isUser ? buildMeta(message) : null;
  const hasMultipleBranches = branchInfo && branchInfo.total > 1;

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 text-text ${
          isUser
            ? 'rounded-tr-md bg-surface-2'
            : 'rounded-tl-md bg-surface border-l-2'
        }`}
        style={!isUser ? { borderColor: color } : undefined}
      >
        {isEditing ? (
          <div className="space-y-2 min-w-[220px]">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-surface-2 rounded p-2 text-sm text-text border border-border focus:outline-none focus:border-accent resize-y min-h-[60px]"
              autoFocus
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-2 py-1 text-xs rounded bg-surface hover:bg-surface-2 text-text-muted flex items-center gap-1"
                aria-label="Cancel edit"
              >
                <X size={12} /> Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-2 py-1 text-xs rounded bg-accent text-accent-contrast flex items-center gap-1 font-medium"
                aria-label="Save edit"
              >
                <Check size={12} /> Save
              </button>
            </div>
          </div>
        ) : showDeleteConfirm ? (
          <div className="space-y-2 py-1">
            <div className="text-xs text-text font-medium">Delete this message and its branch?</div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2 py-0.5 text-xs rounded bg-surface hover:bg-surface-2 text-text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDelete?.(message.id);
                }}
                className="px-2 py-0.5 text-xs rounded bg-danger text-white font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`${
                isUser ? 'whitespace-pre-wrap' : 'italic whitespace-pre-wrap'
              }`}
            >
              {message.content}
            </div>

            {message.isEdited && (
              <span className="text-[10px] text-text-muted ml-1 not-italic">
                (edited)
              </span>
            )}

            {meta && (
              <div className="mt-2 text-[10px] uppercase tracking-wide text-text-muted">
                {meta}
              </div>
            )}
          </>
        )}
      </div>

      {/* Message action bar */}
      {!isEditing && !showDeleteConfirm && (
        <div
          className={`flex items-center gap-1 mt-1 px-1 text-text-muted text-xs ${
            isUser ? 'justify-end' : 'justify-start'
          }`}
        >
          {hasMultipleBranches && (
            <div className="flex items-center gap-0.5 mr-1 bg-surface-2 px-1.5 py-0.5 rounded text-[11px]">
              <button
                type="button"
                disabled={isStreaming || !branchInfo.prevSiblingId}
                onClick={() => branchInfo.prevSiblingId && onSwitchBranch?.(branchInfo.prevSiblingId)}
                className="p-0.5 hover:text-text disabled:opacity-30 disabled:hover:text-text-muted"
                aria-label="Previous branch"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="tabular-nums px-0.5">
                {branchInfo.currentIndex + 1}/{branchInfo.total}
              </span>
              <button
                type="button"
                disabled={isStreaming || !branchInfo.nextSiblingId}
                onClick={() => branchInfo.nextSiblingId && onSwitchBranch?.(branchInfo.nextSiblingId)}
                className="p-0.5 hover:text-text disabled:opacity-30 disabled:hover:text-text-muted"
                aria-label="Next branch"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}

          {!isUser && onRegenerate && (
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => onRegenerate(message.id)}
              className="p-1 hover:text-accent rounded hover:bg-surface-2 disabled:opacity-30 flex items-center gap-1 text-[11px]"
              title="Regenerate response"
              aria-label="Regenerate message"
            >
              <RotateCw size={12} className={isStreaming ? 'animate-spin' : ''} />
            </button>
          )}

          {onEdit && (
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => {
                setEditContent(message.content);
                setIsEditing(true);
              }}
              className="p-1 hover:text-text rounded hover:bg-surface-2 disabled:opacity-30"
              title="Edit message"
              aria-label="Edit message"
            >
              <Pencil size={12} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowDebug((prev) => !prev)}
            className={`p-1 rounded hover:bg-surface-2 ${
              showDebug ? 'text-accent' : 'hover:text-text'
            }`}
            title="Inspect debug metrics"
            aria-label="Inspect debug metrics"
          >
            <Wrench size={12} />
          </button>

          {onDelete && (
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1 hover:text-danger rounded hover:bg-surface-2 disabled:opacity-30"
              title="Delete message"
              aria-label="Delete message"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}

      {/* Collapsible Debug Panel */}
      {showDebug && (
        <div className="mt-2 w-full max-w-[92%] bg-surface-2 border border-border rounded-xl p-3 text-xs space-y-2 font-mono shadow-sm">
          <div className="flex items-center justify-between text-text-muted border-b border-border pb-1">
            <span className="font-semibold text-text uppercase tracking-wider text-[10px]">
              🔧 Diagnostics & LLM Inspector
            </span>
            <button
              type="button"
              onClick={() => setShowDebug(false)}
              className="text-text-muted hover:text-text text-[11px]"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
            <div>
              <span className="text-text-muted">Role: </span>
              <span className="text-text font-medium">{message.role}</span>
            </div>
            <div>
              <span className="text-text-muted">Personality: </span>
              <span className="text-text font-medium">{message.personality ?? '—'}</span>
            </div>
            <div>
              <span className="text-text-muted">Provider: </span>
              <span className="text-text font-medium">{message.provider ?? '—'}</span>
            </div>
            <div>
              <span className="text-text-muted">Model: </span>
              <span className="text-text font-medium">{message.model ?? '—'}</span>
            </div>
            <div>
              <span className="text-text-muted">Latency: </span>
              <span className="text-text font-medium">
                {message.latencyMs != null
                  ? `${message.latencyMs}ms (${(message.latencyMs / 1000).toFixed(2)}s)`
                  : '—'}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Tokens: </span>
              <span className="text-text font-medium">
                {message.tokensUsed
                  ? `${message.tokensUsed.prompt}↑ / ${message.tokensUsed.completion}↓ (Total: ${
                      message.tokensUsed.prompt + message.tokensUsed.completion
                    })`
                  : '—'}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Edited: </span>
              <span className="text-text font-medium">
                {message.isEdited ? 'Yes' : 'No'}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Timestamp: </span>
              <span className="text-text font-medium">
                {message.createdAt.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
          </div>

          {message.systemPrompt && (
            <div className="pt-1">
              <div className="text-[10px] uppercase text-text-muted font-semibold mb-1">
                System Prompt
              </div>
              <pre className="bg-surface p-2 rounded text-[10px] text-text whitespace-pre-wrap max-h-32 overflow-y-auto border border-border">
                {message.systemPrompt}
              </pre>
            </div>
          )}

          {message.rawPrompt && (
            <div className="pt-1">
              <div className="text-[10px] uppercase text-text-muted font-semibold mb-1">
                Raw Context Prompt
              </div>
              <pre className="bg-surface p-2 rounded text-[10px] text-text whitespace-pre-wrap max-h-32 overflow-y-auto border border-border">
                {message.rawPrompt}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function buildMeta(message: Message): string | null {
  if (!message.provider && !message.model && !message.tokensUsed) return null;
  const parts: string[] = [];
  if (message.personality) parts.push(message.personality);
  if (message.provider) parts.push(message.provider);
  if (message.model) parts.push(message.model);
  if (message.tokensUsed) {
    parts.push(`${message.tokensUsed.prompt}↑/${message.tokensUsed.completion}↓`);
  }
  return parts.join(' · ');
}