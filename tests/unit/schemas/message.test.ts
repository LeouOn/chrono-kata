import { describe, it, expect } from 'vitest';
import { MessageSchema } from '@/lib/schemas/message';

const validBase = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  conversationId: '123e4567-e89b-12d3-a456-426614174001',
  role: 'user' as const,
  content: 'Hello, world!',
  createdAt: new Date('2026-07-26T10:00:00Z'),
} as const;

describe('MessageSchema', () => {
  it('accepts a valid user message with required fields only', () => {
    const result = MessageSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('accepts a valid assistant message', () => {
    const result = MessageSchema.safeParse({
      ...validBase,
      role: 'assistant',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a message with all optional fields', () => {
    const result = MessageSchema.safeParse({
      ...validBase,
      parentId: '123e4567-e89b-12d3-a456-426614174002',
      provider: 'openrouter',
      model: 'minimax/MiniMax-M3',
      personality: 'zen',
      tokensUsed: { prompt: 100, completion: 50 },
      latencyMs: 2300,
      isEdited: false,
      editedAt: new Date('2026-07-26T10:01:00Z'),
    });
    expect(result.success).toBe(true);
  });

  it('accepts null parentId (root message)', () => {
    const result = MessageSchema.safeParse({
      ...validBase,
      parentId: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid personalities', () => {
    for (const personality of ['zen', 'hype', 'analyst', 'buddy', 'athena'] as const) {
      const result = MessageSchema.safeParse({ ...validBase, personality });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid role', () => {
    const result = MessageSchema.safeParse({
      ...validBase,
      role: 'system',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid personality', () => {
    const result = MessageSchema.safeParse({
      ...validBase,
      personality: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    const result = MessageSchema.safeParse({
      ...validBase,
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid conversationId', () => {
    const result = MessageSchema.safeParse({
      ...validBase,
      conversationId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid parentId', () => {
    const result = MessageSchema.safeParse({
      ...validBase,
      parentId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects tokensUsed with missing completion', () => {
    const result = MessageSchema.safeParse({
      ...validBase,
      tokensUsed: { prompt: 100 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing createdAt', () => {
    const { createdAt: _omit, ...rest } = validBase;
    const result = MessageSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});
