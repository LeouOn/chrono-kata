import { liveQuery } from 'dexie';
import type { Session, SessionInput } from '@/lib/schemas/session';
import { SessionSchema } from '@/lib/schemas/session';
import { getDb } from './db';
import { newId } from '@/lib/utils/id';
import { conversationRepo } from './conversation.repo';
import { messageRepo } from './message.repo';
import { sumSessionMinutes } from '@/lib/sessions/outcome';

/**
 * Fields whose change can move a linked task's cached `actualMin`.
 * A patch that does not touch them (a note, a rating, a streamed coach comment)
 * never triggers a recompute, so token-by-token updates stay cheap.
 */
function affectsTaskMinutes(patch: Partial<Session>): boolean {
  return (
    'durationMinutes' in patch || 'reps' in patch || 'taskId' in patch || 'projectId' in patch
  );
}

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
    const sessionId = newId();
    const db = getDb();
    const session: Session = {
      ...input,
      id: sessionId,
      conversationId: newId(),
      createdAt: now,
      updatedAt: now,
      coachComment: null,
      calendarEventId: null,
      failedLLM: false,
    };
    const parsed = SessionSchema.parse(session);
    // The conversation, the session row and a linked task's recomputed
    // actualMin land together; a linked save can never leave the cache stale.
    await db.transaction('rw', [db.sessions, db.conversations, db.tasks], async () => {
      const conversation = await conversationRepo.save({ sessionId });
      await db.sessions.add({ ...parsed, conversationId: conversation.id });
      if (parsed.taskId) await recomputeActualMinutes(db, [parsed.taskId]);
    });
    const stored = await db.sessions.get(sessionId);
    if (!stored) throw new Error(`Session ${sessionId} was not stored`);
    return stored;
  }

  async update(id: string, patch: Partial<Session>): Promise<Session> {
    const db = getDb();
    // `actualMin` on a task is a cache of its linked sessions (Wave 9 part 1),
    // so an edit that changes minutes or links must recompute it in the SAME
    // transaction as the session write. Otherwise the cache starts lying.
    return db.transaction('rw', [db.sessions, db.tasks], async () => {
      const existing = await db.sessions.get(id);
      if (!existing) throw new Error(`Session ${id} not found`);
      const updated: Session = { ...existing, ...patch, updatedAt: new Date() };
      const parsed = SessionSchema.parse(updated);
      await db.sessions.put(parsed);
      if (affectsTaskMinutes(patch)) {
        await recomputeActualMinutes(db, [existing.taskId, parsed.taskId]);
      }
      return parsed;
    });
  }

  async delete(id: string): Promise<void> {
    const db = getDb();
    return db.transaction('rw', [db.sessions, db.tasks], async () => {
      const existing = await db.sessions.get(id);
      await db.sessions.delete(id);
      await recomputeActualMinutes(db, [existing?.taskId]);
    });
  }
}

/**
 * Rewrite `actualMin` for each affected task from the session rows themselves.
 *
 * - Derived, never accumulated: the sessions are the source of truth, so edits,
 *   deletes and re-links all converge on the same value.
 * - `0` is stored as `null` (the schema allows positive values or null).
 * - A missing (orphaned) task is skipped: there is nothing to update.
 * - There is no manual-override flag yet; if one is added, this must respect it.
 */
async function recomputeActualMinutes(
  db: ReturnType<typeof getDb>,
  taskIds: Array<string | null | undefined>,
): Promise<void> {
  const unique = [...new Set(taskIds.filter((id): id is string => typeof id === 'string' && id !== ''))];
  for (const taskId of unique) {
    const task = await db.tasks.get(taskId);
    if (!task) continue;
    const sessions = await db.sessions.where('taskId').equals(taskId).toArray();
    const total = sumSessionMinutes(sessions);
    const next = total > 0 ? total : null;
    if (task.actualMin !== next) {
      await db.tasks.put({ ...task, actualMin: next });
    }
  }
}

export const sessionRepo: SessionRepository = new DexieSessionRepository();

async function migrateToConversation(session: Session): Promise<Session> {
  const conversation = await conversationRepo.save({ sessionId: session.id });
  if (session.coachComment) {
    const assistantMessage = await messageRepo.save({
      conversationId: conversation.id,
      parentId: null,
      role: 'assistant',
      content: session.coachComment as string,
    });
    await conversationRepo.update(conversation.id, {
      rootMessageId: assistantMessage.id,
      activeLeafId: assistantMessage.id,
    });
  }
  const updatedSession: Session = {
    ...session,
    conversationId: conversation.id,
    updatedAt: new Date(),
  };
  await getDb().sessions.put(updatedSession);
  return updatedSession;
}
