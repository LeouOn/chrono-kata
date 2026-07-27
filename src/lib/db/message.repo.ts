import type { Message, MessageInput } from '@/lib/schemas/message';
import { MessageSchema } from '@/lib/schemas/message';
import { getDb } from './db';
import { newId } from '@/lib/utils/id';

export interface MessageRepository {
  getById(id: string): Promise<Message | null>;
  getByConversation(conversationId: string): Promise<Message[]>;
  getRootMessages(conversationId: string): Promise<Message[]>;
  getChildren(parentId: string): Promise<Message[]>;
  /** Walk parentId pointers from leaf up to root, then return the path root → leaf. */
  getPathToLeaf(conversationId: string, leafId: string): Promise<Message[]>;
  save(input: MessageInput): Promise<Message>;
  update(id: string, patch: Partial<Message>): Promise<Message>;
  delete(id: string): Promise<void>;
}

export class DexieMessageRepository implements MessageRepository {
  async getById(id: string): Promise<Message | null> {
    const result = await getDb().messages.get(id);
    return result ?? null;
  }

  async getByConversation(conversationId: string): Promise<Message[]> {
    return getDb().messages.where('conversationId').equals(conversationId).toArray();
  }

async getRootMessages(conversationId: string): Promise<Message[]> {
    const all = await this.getByConversation(conversationId);
    return all.filter((m) => m.parentId == null);
  }

  async getChildren(parentId: string): Promise<Message[]> {
    const all = await getDb().messages.toArray();
    return all.filter((m) => m.parentId === parentId);
  }

async getPathToLeaf(conversationId: string, leafId: string): Promise<Message[]> {
    const all = await this.getByConversation(conversationId);
    const byId = new Map(all.map((m) => [m.id, m]));
    const chain: Message[] = [];
    let current = byId.get(leafId);
    while (current) {
      chain.push(current);
      if (current.parentId == null) break;
      current = byId.get(current.parentId);
    }
    if (chain.length === 0) return [];
    if (chain[chain.length - 1]?.parentId != null) return [];
    return chain.reverse();
  }

async save(input: MessageInput): Promise<Message> {
    const message: Message = {
      ...input,
      id: newId(),
      createdAt: new Date(),
    };
    const parsed = MessageSchema.parse(message);
    await getDb().messages.put(parsed);
    return parsed;
  }

async update(id: string, patch: Partial<Message>): Promise<Message> {
    const db = getDb();
    const existing = await db.messages.get(id);
    if (!existing) throw new Error(`Message ${id} not found`);
    const updated: Message = { ...existing, ...patch };
    await db.messages.put(updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await getDb().messages.delete(id);
  }
}

export const messageRepo: MessageRepository = new DexieMessageRepository();
