import { describe, it, expect } from 'vitest';
import { ConversationSchema } from '@/lib/schemas/conversation';

const validBase = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  sessionId: '123e4567-e89b-12d3-a456-426614174001',
  createdAt: new Date('2026-07-26T10:00:00Z'),
  updatedAt: new Date('2026-07-26T10:00:00Z'),
} as const;

describe('ConversationSchema', () => {
  it('accepts a valid conversation with required fields only', () => {
    const result = ConversationSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('accepts a valid conversation with all optional fields', () => {
    const result = ConversationSchema.safeParse({
      ...validBase,
      rootMessageId: '123e4567-e89b-12d3-a456-426614174002',
      activeLeafId: '123e4567-e89b-12d3-a456-426614174003',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null rootMessageId and activeLeafId', () => {
    const result = ConversationSchema.safeParse({
      ...validBase,
      rootMessageId: null,
      activeLeafId: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-uuid id', () => {
    const result = ConversationSchema.safeParse({
      ...validBase,
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid sessionId', () => {
    const result = ConversationSchema.safeParse({
      ...validBase,
      sessionId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid rootMessageId', () => {
    const result = ConversationSchema.safeParse({
      ...validBase,
      rootMessageId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing createdAt', () => {
    const { createdAt: _omit, ...rest } = validBase;
    const result = ConversationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing updatedAt', () => {
    const { updatedAt: _omit, ...rest } = validBase;
    const result = ConversationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});
