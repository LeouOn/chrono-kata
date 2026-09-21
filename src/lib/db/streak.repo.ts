import type { Streak } from '@/lib/schemas/streak';
import { getDb } from './db';

export interface StreakRepository {
  get(): Promise<Streak>;
  save(streak: Streak): Promise<void>;
}

export class DexieStreakRepository implements StreakRepository {
  async get(): Promise<Streak> {
    const db = getDb();
    const existing = await db.streak.get('singleton');
    if (existing) return existing;
    const fresh: Streak = {
      id: 'singleton',
      currentStreakDays: 0,
      longestStreakDays: 0,
      lastSessionDate: '1970-01-01',
      milestonesAchieved: [],
      freezeUsedOn: [],
      updatedAt: new Date(),
    };
    await db.streak.put(fresh);
    return fresh;
  }

  async save(streak: Streak): Promise<void> {
    await getDb().streak.put(streak);
  }
}

export const streakRepo: StreakRepository = new DexieStreakRepository();
