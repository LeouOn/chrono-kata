import { DomainSchema, DomainInputSchema, type Domain, type DomainInput } from '@/lib/schemas/domain';
import { newId } from '@/lib/utils/id';
import { getDb } from './db';

export interface DomainRepository {
  getAll(): Promise<Domain[]>;
  getById(id: string): Promise<Domain | undefined>;
  create(input: DomainInput): Promise<Domain>;
  update(id: string, patch: Partial<DomainInput>): Promise<Domain>;
  delete(id: string): Promise<void>;
}

export class DexieDomainRepository implements DomainRepository {
  async getAll(): Promise<Domain[]> {
    const all = await getDb().domains.toArray();
    return all.sort((a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getById(id: string): Promise<Domain | undefined> {
    return getDb().domains.get(id);
  }

  async create(input: DomainInput): Promise<Domain> {
    const parsed = DomainInputSchema.parse(input);
    const db = getDb();
    const order = parsed.order ?? (await db.domains.count());
    const domain: Domain = DomainSchema.parse({
      ...parsed,
      order,
      id: newId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.domains.put(domain);
    return domain;
  }

  async update(id: string, patch: Partial<DomainInput>): Promise<Domain> {
    const db = getDb();
    return db.transaction('rw', db.domains, async () => {
      const existing = await db.domains.get(id);
      if (!existing) throw new Error(`Domain ${id} not found`);
      const updated = DomainSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      });
      await db.domains.put(updated);
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    await getDb().domains.delete(id);
  }
}

export const domainRepo: DomainRepository = new DexieDomainRepository();
