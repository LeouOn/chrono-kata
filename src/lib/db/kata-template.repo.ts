import {
  KataTemplateSchema,
  KataTemplateInputSchema,
  DEFAULT_KATA_TEMPLATES,
  type KataTemplate,
  type KataTemplateInput,
} from '@/lib/schemas/kata-template';
import { newId } from '@/lib/utils/id';
import { getDb } from './db';

export interface KataTemplateRepository {
  getAll(): Promise<KataTemplate[]>;
  getById(id: string): Promise<KataTemplate | undefined>;
  create(input: KataTemplateInput): Promise<KataTemplate>;
  update(id: string, patch: Partial<KataTemplateInput>): Promise<KataTemplate>;
  delete(id: string): Promise<void>;
  reorder(orderedIds: string[]): Promise<void>;
  seedDefaultsIfEmpty(): Promise<KataTemplate[]>;
}

export class DexieKataTemplateRepository implements KataTemplateRepository {
  async seedDefaultsIfEmpty(): Promise<KataTemplate[]> {
    const db = getDb();
    const count = await db.kataTemplates.count();
    if (count > 0) {
      return this.getAll();
    }

    const now = new Date();
    const seeded: KataTemplate[] = DEFAULT_KATA_TEMPLATES.map((t, idx) => ({
      ...t,
      id: newId(),
      icon: t.icon ?? '🥋',
      order: idx,
      createdAt: now,
      updatedAt: now,
    }));

    await db.kataTemplates.bulkPut(seeded);
    return seeded;
  }

  async getAll(): Promise<KataTemplate[]> {
    const db = getDb();
    const count = await db.kataTemplates.count();
    if (count === 0) {
      return this.seedDefaultsIfEmpty();
    }
    const all = await db.kataTemplates.toArray();
    return all.sort((a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getById(id: string): Promise<KataTemplate | undefined> {
    return getDb().kataTemplates.get(id);
  }

  async create(input: KataTemplateInput): Promise<KataTemplate> {
    const parsed = KataTemplateInputSchema.parse(input);
    const db = getDb();
    const count = await db.kataTemplates.count();
    const now = new Date();

    const template: KataTemplate = {
      id: newId(),
      name: parsed.name,
      mode: parsed.mode,
      defaultDurationMinutes: parsed.defaultDurationMinutes ?? null,
      defaultReps: parsed.defaultReps ?? null,
      activityLabel: parsed.activityLabel,
      defaultNote: parsed.defaultNote,
      icon: parsed.icon ?? '🥋',
      order: parsed.order ?? count,
      createdAt: now,
      updatedAt: now,
    };

    const validated = KataTemplateSchema.parse(template);
    await db.kataTemplates.put(validated);
    return validated;
  }

  async update(id: string, patch: Partial<KataTemplateInput>): Promise<KataTemplate> {
    const db = getDb();
    const existing = await db.kataTemplates.get(id);
    if (!existing) {
      throw new Error(`KataTemplate ${id} not found`);
    }

    const updated: KataTemplate = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };

    const validated = KataTemplateSchema.parse(updated);
    await db.kataTemplates.put(validated);
    return validated;
  }

  async delete(id: string): Promise<void> {
    await getDb().kataTemplates.delete(id);
  }

  async reorder(orderedIds: string[]): Promise<void> {
    const db = getDb();
    const now = new Date();
    await db.transaction('rw', db.kataTemplates, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        const id = orderedIds[i]!;
        const item = await db.kataTemplates.get(id);
        if (item) {
          await db.kataTemplates.put({
            ...item,
            order: i,
            updatedAt: now,
          });
        }
      }
    });
  }
}

export const kataTemplateRepo: KataTemplateRepository = new DexieKataTemplateRepository();
