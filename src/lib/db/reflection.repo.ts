import { liveQuery } from 'dexie';
import type { Reflection } from '@/lib/schemas/reflection';
import { getDb } from './db';
import { newId } from '@/lib/utils/id';

export interface ReflectionRepository {
  getAll(): Promise<Reflection[]>;
  watch(): { subscribe: (cb: (r: Reflection[]) => void) => () => void };
  save(input: Omit<Reflection, 'id' | 'createdAt'>): Promise<Reflection>;
  delete(id: string): Promise<void>;
}

export class DexieReflectionRepository implements ReflectionRepository {
  async getAll(): Promise<Reflection[]> {
    return getDb().reflections.orderBy('periodStart').reverse().toArray();
  }

  watch() {
    const observable = liveQuery(() => getDb().reflections.orderBy('periodStart').reverse().toArray());
    return {
      subscribe: (cb: (r: Reflection[]) => void) => {
        const subscription = observable.subscribe({ next: cb });
        return () => subscription.unsubscribe();
      },
    };
  }

  async save(input: Omit<Reflection, 'id' | 'createdAt'>): Promise<Reflection> {
    const reflection: Reflection = { ...input, id: newId(), createdAt: new Date() };
    await getDb().reflections.add(reflection);
    return reflection;
  }

  async delete(id: string): Promise<void> {
    await getDb().reflections.delete(id);
  }
}

export const reflectionRepo: ReflectionRepository = new DexieReflectionRepository();
