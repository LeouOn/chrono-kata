import { liveQuery } from 'dexie';
import type { Session, SessionInput } from '@/lib/schemas/session';
import { SessionSchema } from '@/lib/schemas/session';
import { getDb } from './db';
import { newId } from '@/lib/utils/id';
import { conversationRepo } from './conversation.repo';
import { messageRepo } from './message.repo';

export interface SessionRepository {
  getAll(): Promise<Session[]>;
  getByPeriod(start: Date, end: Date): Promise<Session[]>;
  getById(id: string): Promise<Session | null>;
  watch(): { subscribe: (cb: (sessions: Session[]) => void) => () => void };
  save(input: SessionInput): Promise<Session>;
  update(id: string, patch: Partial<Session>): Promise<Session>;
  delete(id: string): Promise<void>;
}

export class DexieSessionRepository implements SessionRepository {
  async getAll(): Promise<Session[]> {
    const db = getDb();
    const rows = await db.sessions.orderBy('startedAt').reverse().toArray();
    return rows;
  }

  async getByPeriod(start: Date, end: Date): Promise<Session[]> {
    const db = getDb();
    return db.sessions.where('startedAt').between(start, end, true, false).toArray();
  }

  async getById(id: string): Promise<Session | null> {
    const result = await getDb().sessions.get(id);
    if (!result) return null;
    // Lazy Wave 11 migration: if the session predates conversation tracking
    // but has a coachComment, materialize a conversation + assistant message
    // so the detail page can render the full thread.
    if (!result.conversationId && result.coachComment) {
      const migrated = await migrateToConversation(result);
      return migrated;
    }
    return result;
  }

  watch() {
    const db = getDb();
    const observable = liveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray());
    return {
      subscribe: (cb: (sessions: Session[]) => void) => {
        const subscription = observable.subscribe({ next: cb });
        return () => subscription.unsubscribe();
      },
    };
  }

  async save(input: SessionInput): Promise<Session> {
    const now = new Date();
    const session: Session = {
      ...input,
      id: newId(),
      createdAt: now,
      updatedAt: now,
      coachComment: null,
      calendarEventId: null,
      failedLLM: false,
    };
    const parsed = SessionSchema.parse(session);
    const db = getDb();
    await db.sessions.add(parsed);
    return parsed;
  }

  async update(id: string, patch: Partial<Session>): Promise<Session> {
    const db = getDb();
    const existing = await db.sessions.get(id);
    if (!existing) throw new Error(`Session ${id} not found`);
    const updated: Session = { ...existing, ...patch, updatedAt: new Date() };
    const parsed = SessionSchema.parse(updated);
    await db.sessions.put(parsed);
    return parsed;
  }

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.sessions.delete(id);
  }
}

export const sessionRepo: SessionRepository = new DexieSessionRepository();

async function migrateToConversation(session: Session): Promise<Session> {
  const conversation = await conversationRepo.save({ sessionId: session.id });
  const assistantMessage = await messageRepo.save({
    conversationId: conversation.id,
    parentId: null,
    role: 'assistant',
    content: session.coachComment as string,
  });
  const updatedConversation = await conversationRepo.update(conversation.id, {
    rootMessageId: assistantMessage.id,
    activeLeafId: assistantMessage.id,
  });
  const updatedSession: Session = {
    ...session,
    conversationId: updatedConversation.id,
    updatedAt: new Date(),
  };
  await getDb().sessions.put(updatedSession);
  return updatedSession;
}
