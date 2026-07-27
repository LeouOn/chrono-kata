import { describe, it, expect, beforeEach } from 'vitest';
import { resetDbForTesting, type ChronoKataDB } from '@/lib/db/db';
import { DexieConversationRepository } from '@/lib/db/conversation.repo';
import type { ConversationInput } from '@/lib/schemas/conversation';

let db: ChronoKataDB;
let repo: DexieConversationRepository;

beforeEach(async () => {
  db = await resetDbForTesting();
  repo = new DexieConversationRepository();
});

const validInput: ConversationInput = {
  sessionId: '123e4567-e89b-12d3-a456-426614174001',
};

describe('DexieConversationRepository', () => {
  it('saves a conversation and assigns id + timestamps', async () => {
    const saved = await repo.save(validInput);
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.updatedAt).toBeInstanceOf(Date);
  });

  it('getById returns the saved conversation', async () => {
    const saved = await repo.save(validInput);
    const fetched = await repo.getById(saved.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(saved.id);
    expect(fetched!.sessionId).toBe(saved.sessionId);
  });

  it('getById returns null for unknown id', async () => {
    const fetched = await repo.getById('123e4567-e89b-12d3-a456-426614174999');
    expect(fetched).toBeNull();
  });

  it('getBySessionId returns the conversation for a session', async () => {
    const saved = await repo.save(validInput);
    const fetched = await repo.getBySessionId(validInput.sessionId);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(saved.id);
  });

  it('getBySessionId returns null when no conversation exists', async () => {
    const fetched = await repo.getBySessionId('123e4567-e89b-12d3-a456-426614174999');
    expect(fetched).toBeNull();
  });

  it('update mutates only patched fields and bumps updatedAt', async () => {
    const saved = await repo.save(validInput);
    const originalUpdatedAt = saved.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.update(saved.id, { sessionId: '123e4567-e89b-12d3-a456-426614174002' });
    expect(updated.sessionId).toBe('123e4567-e89b-12d3-a456-426614174002');
    expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });

  it('delete removes the conversation', async () => {
    const saved = await repo.save(validInput);
    await repo.delete(saved.id);
    const fetched = await repo.getById(saved.id);
    expect(fetched).toBeNull();
  });

  it('update throws on unknown id', async () => {
    await expect(repo.update('nonexistent', { sessionId: '123e4567-e89b-12d3-a456-426614174002' })).rejects.toThrow();
  });
});
