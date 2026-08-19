import type { Session } from '@/lib/schemas/session';
import type { Conversation } from '@/lib/schemas/conversation';
import type { Message } from '@/lib/schemas/message';
import { formatDuration } from './format';

export interface ConversationExportData {
  exportedAt: string;
  session: {
    id: string;
    startedAt: string;
    durationMinutes?: number | null;
    reps?: number | null;
    rating: number;
    activityLabel?: string;
    note?: string;
  };
  conversation: {
    id: string;
    createdAt: string;
    activeLeafId?: string | null;
  };
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    personality?: string;
    provider?: string;
    model?: string;
    tokensUsed?: { prompt: number; completion: number };
    latencyMs?: number;
    isEdited?: boolean;
    createdAt: string;
  }>;
}

export function buildConversationExportData(
  session: Session,
  conversation: Conversation,
  messages: Message[],
): ConversationExportData {
  return {
    exportedAt: new Date().toISOString(),
    session: {
      id: session.id,
      startedAt: session.startedAt.toISOString(),
      durationMinutes: session.durationMinutes,
      reps: session.reps,
      rating: session.rating,
      activityLabel: session.activityLabel,
      note: session.note,
    },
    conversation: {
      id: conversation.id,
      createdAt: conversation.createdAt.toISOString(),
      activeLeafId: conversation.activeLeafId,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      personality: m.personality,
      provider: m.provider,
      model: m.model,
      tokensUsed: m.tokensUsed,
      latencyMs: m.latencyMs,
      isEdited: m.isEdited,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export function exportConversationAsJson(
  session: Session,
  conversation: Conversation,
  messages: Message[],
): string {
  const data = buildConversationExportData(session, conversation, messages);
  return JSON.stringify(data, null, 2);
}

export function exportConversationAsMarkdown(
  session: Session,
  conversation: Conversation,
  messages: Message[],
): string {
  const dateStr = session.startedAt.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const durationStr =
    session.durationMinutes != null
      ? formatDuration(session.durationMinutes)
      : `${session.reps ?? 0} reps`;

  const lines: string[] = [
    `# Practice Session — ${dateStr}`,
    '',
    `- **Activity:** ${session.activityLabel ?? 'Practice'}`,
    `- **Duration/Reps:** ${durationStr}`,
    `- **Rating:** ${session.rating}/5`,
  ];

  if (session.note) {
    lines.push(`- **Note:** ${session.note}`);
  }

  lines.push('', '---', '', '## Conversation Thread', '');

  for (const m of messages) {
    const time = m.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (m.role === 'user') {
      lines.push(`### 👤 You (${time})`);
      lines.push('');
      lines.push(m.content);
      lines.push('');
    } else {
      const personalityTag = m.personality ? ` (${m.personality.toUpperCase()})` : '';
      lines.push(`### 🧘 Coach${personalityTag} (${time})`);
      lines.push('');
      lines.push(m.content);
      lines.push('');

      const metaParts: string[] = [];
      if (m.provider && m.model) metaParts.push(`${m.provider} / ${m.model}`);
      if (m.tokensUsed) metaParts.push(`${m.tokensUsed.prompt}↑ / ${m.tokensUsed.completion}↓ tokens`);
      if (m.latencyMs) metaParts.push(`${(m.latencyMs / 1000).toFixed(2)}s`);

      if (metaParts.length > 0) {
        lines.push(`> *${metaParts.join(' · ')}*`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.warn('Clipboard write failed:', e);
    return false;
  }
}
