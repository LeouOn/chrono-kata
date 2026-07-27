'use client';

import type { CoachPersonality } from '@/lib/schemas/coach-personality';
import type { Message } from '@/lib/schemas/message';

const PERSONALITY_COLORS: Record<CoachPersonality, string> = {
  zen: 'var(--color-zen)',
  hype: 'var(--color-hype)',
  analyst: 'var(--color-analyst)',
  buddy: 'var(--color-buddy)',
  athena: 'var(--color-athena-from)',
};

interface Props {
  messages: Message[];
}

export function ConversationThread({ messages }: Props) {
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
        <MessageBubble key={m.id} message={m} />
      ))}
    </div>
  );
}

interface BubbleProps {
  message: Message;
}

function MessageBubble({ message }: BubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-surface-2 px-4 py-3 text-text whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  const color = PERSONALITY_COLORS[message.personality ?? 'buddy'];
  const meta = buildMeta(message);

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] rounded-2xl rounded-tl-md bg-surface pl-4 pr-4 py-3 border-l-2"
        style={{ borderColor: color }}
      >
        <div className="text-text italic whitespace-pre-wrap">{message.content}</div>
        {meta && (
          <div className="mt-2 text-[10px] uppercase tracking-wide text-text-muted">
            {meta}
          </div>
        )}
      </div>
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