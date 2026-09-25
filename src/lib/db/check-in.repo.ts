import { CheckInSchema, type CheckIn, type CheckInInput } from '@/lib/schemas/check-in';
import { getDb } from './db';

export interface CheckInRepository {
  getAll(): Promise<CheckIn[]>;
  getByDate(date: string): Promise<CheckIn | undefined>;
  /** Create or replace the check-in for `input.date`. Keeps the original createdAt. */
  upsert(input: CheckInInput): Promise<CheckIn>;
  /** Check-ins with from <= date <= to (both inclusive), sorted by date ascending. */
  range(from: string, to: string): Promise<CheckIn[]>;
  delete(date: string): Promise<void>;
}

export class DexieCheckInRepository implements CheckInRepository {
  async getAll(): Promise<CheckIn[]> {
    return getDb().checkIns.orderBy('date').toArray();
  }

  async getByDate(date: string): Promise<CheckIn | undefined> {
    return getDb().checkIns.get(date);
  }

  async upsert(input: CheckInInput): Promise<CheckIn> {
    const db = getDb();
    return db.transaction('rw', db.checkIns, async () => {
      const existing = await db.checkIns.get(input.date);
      const now = new Date();
      const checkIn: CheckIn = {
        ...input,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const validated = CheckInSchema.parse(checkIn);
      await db.checkIns.put(validated);
      return validated;
    });
  }

  async range(from: string, to: string): Promise<CheckIn[]> {
    if (from > to) return [];
    return getDb().checkIns.where('date').between(from, to, true, true).toArray();
  }

  async delete(date: string): Promise<void> {
    await getDb().checkIns.delete(date);
  }
}

export const checkInRepo: CheckInRepository = new DexieCheckInRepository();
