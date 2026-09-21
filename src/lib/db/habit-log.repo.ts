import {
  HabitLogSchema,
  type HabitLog,
  type HabitLogInput,
} from '@/lib/schemas/habit';
import { newId } from '@/lib/utils/id';
import { getDb } from './db';

export interface HabitLogRepository {
  getForDate(date: string): Promise<HabitLog[]>;
  getForHabitAndDate(habitId: string, date: string): Promise<HabitLog[]>;
  add(input: HabitLogInput): Promise<HabitLog>;
  delete(id: string): Promise<void>;
  /** Remove all manual entries for a habit on a date (undo for boolean habits). */
  deleteManualForHabitAndDate(habitId: string, date: string): Promise<number>;
  /** Remove the newest manual entry for a habit on a date (undo for count habits). */
  deleteLatestManualForHabitAndDate(habitId: string, date: string): Promise<boolean>;
  deleteByHabitId(habitId: string): Promise<void>;
  deleteBySessionId(sessionId: string): Promise<void>;
  /** Remove only session-derived entries for a habit (manual entries stay). */
  deleteSessionSourcedForHabit(habitId: string): Promise<void>;
  /** Idempotently create/update the session-derived entry for a habit + session. */
  upsertForSession(input: HabitLogInput & { sessionId: string }): Promise<HabitLog>;
  deleteAllSessionSourced(): Promise<number>;
}

export class DexieHabitLogRepository implements HabitLogRepository {
  async getForDate(date: string): Promise<HabitLog[]> {
    return getDb().habitLogs.where('date').equals(date).toArray();
  }

  async getForHabitAndDate(habitId: string, date: string): Promise<HabitLog[]> {
    return getDb().habitLogs.where('[habitId+date]').equals([habitId, date]).toArray();
  }

  async add(input: HabitLogInput): Promise<HabitLog> {
    const log: HabitLog = {
      id: newId(),
      createdAt: new Date(),
      ...input,
    };
    const validated = HabitLogSchema.parse(log);
    await getDb().habitLogs.put(validated);
    return validated;
  }

  async delete(id: string): Promise<void> {
    await getDb().habitLogs.delete(id);
  }

  async deleteManualForHabitAndDate(habitId: string, date: string): Promise<number> {
    const logs = await this.getForHabitAndDate(habitId, date);
    const manual = logs.filter((l) => l.source === 'manual');
    await getDb().habitLogs.bulkDelete(manual.map((l) => l.id));
    return manual.length;
  }

  async deleteLatestManualForHabitAndDate(habitId: string, date: string): Promise<boolean> {
    const logs = await this.getForHabitAndDate(habitId, date);
    const manual = logs
      .filter((l) => l.source === 'manual')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const latest = manual[0];
    if (!latest) return false;
    await getDb().habitLogs.delete(latest.id);
    return true;
  }

  async deleteByHabitId(habitId: string): Promise<void> {
    await getDb().habitLogs.where('habitId').equals(habitId).delete();
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await getDb().habitLogs.where('sessionId').equals(sessionId).delete();
  }

  async deleteSessionSourcedForHabit(habitId: string): Promise<void> {
    const db = getDb();
    const ids = await db.habitLogs
      .where('habitId')
      .equals(habitId)
      .filter((l) => l.source === 'session')
      .primaryKeys();
    await db.habitLogs.bulkDelete(ids);
  }

  async upsertForSession(input: HabitLogInput & { sessionId: string }): Promise<HabitLog> {
    const db = getDb();
    const existing = await db.habitLogs
      .where('sessionId')
      .equals(input.sessionId)
      .filter((l) => l.habitId === input.habitId)
      .first();
    if (existing) {
      const updated: HabitLog = { ...existing, ...input, id: existing.id, createdAt: existing.createdAt };
      const validated = HabitLogSchema.parse(updated);
      await db.habitLogs.put(validated);
      return validated;
    }
    return this.add(input);
  }

  async deleteAllSessionSourced(): Promise<number> {
    const db = getDb();
    const ids = await db.habitLogs
      .filter((l) => l.source === 'session')
      .primaryKeys();
    await db.habitLogs.bulkDelete(ids);
    return ids.length;
  }
}

export const habitLogRepo: HabitLogRepository = new DexieHabitLogRepository();
