import type { Conversation, ConversationInput } from '@/lib/schemas/conversation';
import { ConversationSchema } from '@/lib/schemas/conversation';
import { getDb } from './db';
import { newId } from '@/lib/utils/id';

export interface ConversationRepository {
  getById(id: string): Promise<Conversation | null>;
  getBySessionId(sessionId: string): Promise<Conversation | null>;
  save(input: ConversationInput): Promise<Conversation>;
  update(id: string, patch: Partial<Conversation>): Promise<Conversation>;
  delete(id: string): Promise<void>;
}

export class DexieConversationRepository implements ConversationRepository {
  async getById(id: string): Promise<Conversation | null> {
    const result = await getDb().conversations.get(id);
    return result ?? null;
  }

  async getBySessionId(sessionId: string): Promise<Conversation | null> {
    const result = await getDb().conversations.where('sessionId').equals(sessionId).first();
    return result ?? null;
  }

async save(input: ConversationInput): Promise<Conversation> {
    const now = new Date();
    const conv: Conversation = {
      ...input,
      id: newId(),
      rootMessageId: null,
      activeLeafId: null,
      createdAt: now,
      updatedAt: now,
    };
    const parsed = ConversationSchema.parse(conv);
    await getDb().conversations.put(parsed);
    return parsed;
  }

  async update(id: string, patch: Partial<Conversation>): Promise<Conversation> {
    const db = getDb();
    const existing = await db.conversations.get(id);
    if (!existing) throw new Error(`Conversation ${id} not found`);
    const updated: Conversation = { ...existing, ...patch, updatedAt: new Date() };
    const parsed = ConversationSchema.parse(updated);
    await db.conversations.put(parsed);
    return parsed;
  }

  async delete(id: string): Promise<void> {
    await getDb().conversations.delete(id);
  }
}

export const conversationRepo: ConversationRepository = new DexieConversationRepository();
