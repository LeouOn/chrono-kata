import {
  DayPlanSchema,
  DayPlanInputSchema,
  type DayPlan,
  type DayPlanInput,
} from '@/lib/schemas/day-plan';
import { getDb } from './db';

export interface DayPlanRepository {
  getByDate(date: string): Promise<DayPlan | undefined>;
  /** Create or replace the plan for `date`. Keeps the original createdAt. */
  upsert(date: string, input: DayPlanInput): Promise<DayPlan>;
  /** Day plans with from <= date <= to (both inclusive), sorted by date ascending. */
  range(from: string, to: string): Promise<DayPlan[]>;
  delete(date: string): Promise<void>;
}

export class DexieDayPlanRepository implements DayPlanRepository {
  async getByDate(date: string): Promise<DayPlan | undefined> {
    return getDb().dayPlans.get(date);
  }

  async upsert(date: string, input: DayPlanInput): Promise<DayPlan> {
    const parsed = DayPlanInputSchema.parse(input);
    const db = getDb();
    return db.transaction('rw', db.dayPlans, async () => {
      const existing = await db.dayPlans.get(date);
      const plan: DayPlan = DayPlanSchema.parse({
        ...parsed,
        date,
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      });
      await db.dayPlans.put(plan);
      return plan;
    });
  }

  async range(from: string, to: string): Promise<DayPlan[]> {
    if (from > to) return [];
    return getDb().dayPlans.where('date').between(from, to, true, true).toArray();
  }

  async delete(date: string): Promise<void> {
    await getDb().dayPlans.delete(date);
  }
}

export const dayPlanRepo: DayPlanRepository = new DexieDayPlanRepository();
