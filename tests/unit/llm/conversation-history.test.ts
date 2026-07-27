import { describe, it, expect } from 'vitest';
import { buildConversationContext } from '@/lib/llm/conversation-history';
import type { Message } from '@/lib/schemas/message';

const convId = '123e4567-e89b-12d3-a456-426614174000';

const makeMsg = (overrides: Partial<Message>): Message => ({
  id: crypto.randomUUID(),
  conversationId: convId,
  parentId: null,
  role: 'user',
  content: 'x',
  createdAt: new Date('2026-07-26T10:00:00Z'),
  ...overrides,
});

describe('buildConversationContext', () => {
  it('returns empty array for empty input', () => {
    expect(buildConversationContext([])).toEqual([]);
  });

  it('maps user/assistant to chat history', () => {
    const result = buildConversationContext([
      makeMsg({ role: 'user', content: 'hi' }),
      makeMsg({ role: 'assistant', content: 'hello' }),
    ]);
    expect(result).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('preserves order', () => {
    const result = buildConversationContext([
      makeMsg({ role: 'user', content: 'a' }),
      makeMsg({ role: 'assistant', content: 'b' }),
      makeMsg({ role: 'user', content: 'c' }),
    ]);
    expect(result.map((m) => m.content)).toEqual(['a', 'b', 'c']);
  });
});