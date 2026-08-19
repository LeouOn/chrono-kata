import { describe, it, expect } from 'vitest';
import { computeBranchMap } from '@/hooks/useConversation';
import type { Message } from '@/lib/schemas/message';

describe('computeBranchMap', () => {
  const convId = '123e4567-e89b-12d3-a456-426614174000';

  it('returns empty object when messages array is empty', () => {
    const map = computeBranchMap([]);
    expect(map).toEqual({});
  });

  it('computes 1/1 branch info for linear conversation', () => {
    const m1: Message = {
      id: 'm1',
      conversationId: convId,
      parentId: null,
      role: 'user',
      content: 'Session 1',
      createdAt: new Date('2026-07-26T10:00:00Z'),
    };
    const m2: Message = {
      id: 'm2',
      conversationId: convId,
      parentId: 'm1',
      role: 'assistant',
      content: 'Coach response',
      createdAt: new Date('2026-07-26T10:00:01Z'),
    };

    const map = computeBranchMap([m1, m2]);
    expect(map['m1']).toEqual({
      currentIndex: 0,
      total: 1,
      prevSiblingId: null,
      nextSiblingId: null,
    });
    expect(map['m2']).toEqual({
      currentIndex: 0,
      total: 1,
      prevSiblingId: null,
      nextSiblingId: null,
    });
  });

  it('computes pagination and prev/next links for sibling branches', () => {
    const root: Message = {
      id: 'root',
      conversationId: convId,
      parentId: null,
      role: 'user',
      content: 'Session root',
      createdAt: new Date('2026-07-26T10:00:00Z'),
    };
    const a1: Message = {
      id: 'a1',
      conversationId: convId,
      parentId: 'root',
      role: 'assistant',
      content: 'Response v1',
      createdAt: new Date('2026-07-26T10:01:00Z'),
    };
    const a2: Message = {
      id: 'a2',
      conversationId: convId,
      parentId: 'root',
      role: 'assistant',
      content: 'Response v2 (regenerated)',
      createdAt: new Date('2026-07-26T10:02:00Z'),
    };
    const a3: Message = {
      id: 'a3',
      conversationId: convId,
      parentId: 'root',
      role: 'assistant',
      content: 'Response v3 (regenerated again)',
      createdAt: new Date('2026-07-26T10:03:00Z'),
    };

    const map = computeBranchMap([root, a2, a1, a3]);

    expect(map['a1']).toEqual({
      currentIndex: 0,
      total: 3,
      prevSiblingId: null,
      nextSiblingId: 'a2',
    });
    expect(map['a2']).toEqual({
      currentIndex: 1,
      total: 3,
      prevSiblingId: 'a1',
      nextSiblingId: 'a3',
    });
    expect(map['a3']).toEqual({
      currentIndex: 2,
      total: 3,
      prevSiblingId: 'a2',
      nextSiblingId: null,
    });
  });
});
