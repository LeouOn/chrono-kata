import { describe, it, expect } from 'vitest';
import {
  exportConversationAsJson,
  exportConversationAsMarkdown,
  buildConversationExportData,
} from '@/lib/utils/conversation-export';
import type { Session } from '@/lib/schemas/session';
import type { Conversation } from '@/lib/schemas/conversation';
import type { Message } from '@/lib/schemas/message';

describe('conversation-export', () => {
  const mockSession: Session = {
    id: '11111111-1111-1111-1111-111111111111',
    startedAt: new Date('2026-07-26T10:00:00Z'),
    durationMinutes: 25,
    rating: 4,
    activityLabel: 'Meditation',
    note: 'Deep focus today.',
    createdAt: new Date('2026-07-26T10:25:00Z'),
    updatedAt: new Date('2026-07-26T10:25:00Z'),
  };

  const mockConversation: Conversation = {
    id: '22222222-2222-2222-2222-222222222222',
    sessionId: mockSession.id,
    rootMessageId: 'm1',
    activeLeafId: 'm2',
    createdAt: new Date('2026-07-26T10:25:01Z'),
    updatedAt: new Date('2026-07-26T10:25:05Z'),
  };

  const mockMessages: Message[] = [
    {
      id: 'm1',
      conversationId: mockConversation.id,
      parentId: null,
      role: 'user',
      content: 'Session context: 25m Meditation, 4/5.',
      createdAt: new Date('2026-07-26T10:25:01Z'),
    },
    {
      id: 'm2',
      conversationId: mockConversation.id,
      parentId: 'm1',
      role: 'assistant',
      content: 'Maintain steady awareness.',
      personality: 'zen',
      provider: 'openrouter',
      model: 'minimax/minimax-01',
      tokensUsed: { prompt: 150, completion: 45 },
      latencyMs: 1200,
      createdAt: new Date('2026-07-26T10:25:03Z'),
    },
  ];

  it('buildConversationExportData structures session and messages', () => {
    const data = buildConversationExportData(mockSession, mockConversation, mockMessages);
    expect(data.session.id).toBe(mockSession.id);
    expect(data.session.activityLabel).toBe('Meditation');
    expect(data.conversation.id).toBe(mockConversation.id);
    expect(data.messages).toHaveLength(2);
    expect(data.messages[1]!.personality).toBe('zen');
    expect(data.messages[1]!.tokensUsed).toEqual({ prompt: 150, completion: 45 });
  });

  it('exportConversationAsJson returns parseable JSON', () => {
    const jsonStr = exportConversationAsJson(mockSession, mockConversation, mockMessages);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.session.id).toBe(mockSession.id);
    expect(parsed.messages).toHaveLength(2);
  });

  it('exportConversationAsMarkdown generates valid markdown document', () => {
    const md = exportConversationAsMarkdown(mockSession, mockConversation, mockMessages);
    expect(md).toContain('# Practice Session');
    expect(md).toContain('**Activity:** Meditation');
    expect(md).toContain('**Rating:** 4/5');
    expect(md).toContain('Deep focus today.');
    expect(md).toContain('👤 You');
    expect(md).toContain('🧘 Coach (ZEN)');
    expect(md).toContain('Maintain steady awareness.');
    expect(md).toContain('openrouter / minimax/minimax-01');
    expect(md).toContain('150↑ / 45↓ tokens');
  });
});
