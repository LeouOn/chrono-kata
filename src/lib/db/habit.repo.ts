import {
  HabitSchema,
  type Habit,
  type HabitInput,
} from '@/lib/schemas/habit';
import { newId } from '@/lib/utils/id';
import { getDb } from './db';

export interface HabitRepository {
  getAll(): Promise<Habit[]>;
  getById(id: string): Promise<Habit | undefined>;
  create(input: HabitInput): Promise<Habit>;
  update(id: string, patch: Partial<HabitInput>): Promise<Habit>;
  delete(id: string): Promise<void>;
  reorder(orderedIds: string[]): Promise<void>;
}

export class DexieHabitRepository implements HabitRepository {
  async getAll(): Promise<Habit[]> {
    const all = await getDb().habits.toArray();
    return all.sort((a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getById(id: string): Promise<Habit | undefined> {
    return getDb().habits.get(id);
  }

  async create(input: HabitInput): Promise<Habit> {
    const db = getDb();
    const count = await db.habits.count();
    const now = new Date();
    const habit: Habit = {
      id: newId(),
      name: input.name,
      icon: input.icon ?? '✅',
      kind: input.kind,
      unit: input.unit,
      targetPerDay: input.targetPerDay ?? null,
      schedule: input.schedule,
      linkedActivityLabel: input.linkedActivityLabel ?? null,
      order: input.order ?? count,
      archivedAt: input.archivedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const validated = HabitSchema.parse(habit);
    await db.habits.put(validated);
    return validated;
  }

  async update(id: string, patch: Partial<HabitInput>): Promise<Habit> {
    const db = getDb();
    const existing = await db.habits.get(id);
    if (!existing) {
      throw new Error(`Habit ${id} not found`);
    }
    const updated: Habit = { ...existing, ...patch, updatedAt: new Date() };
    const validated = HabitSchema.parse(updated);
    await db.habits.put(validated);
    return validated;
  }

  async delete(id: string): Promise<void> {
    await getDb().habits.delete(id);
  }

  async reorder(orderedIds: string[]): Promise<void> {
    const db = getDb();
    const now = new Date();
    await db.transaction('rw', db.habits, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        const id = orderedIds[i]!;
        const item = await db.habits.get(id);
        if (item) {
          await db.habits.put({ ...item, order: i, updatedAt: now });
        }
      }
    });
  }
}

export const habitRepo: HabitRepository = new DexieHabitRepository();
