import type { PendingCalendarOp } from '@/lib/schemas/pending-calendar-op';
import { getDb } from './db';
import { newId } from '@/lib/utils/id';

export interface PendingCalendarOpsRepository {
  enqueue(op: Omit<PendingCalendarOp, 'id' | 'createdAt' | 'attempts'>): Promise<PendingCalendarOp>;
  getAll(): Promise<PendingCalendarOp[]>;
  update(id: string, patch: Partial<PendingCalendarOp>): Promise<void>;
  delete(id: string): Promise<void>;
}

export class DexiePendingCalendarOpsRepository implements PendingCalendarOpsRepository {
  async enqueue(op: Omit<PendingCalendarOp, 'id' | 'createdAt' | 'attempts'>): Promise<PendingCalendarOp> {
    const full: PendingCalendarOp = { ...op, id: newId(), attempts: 0, createdAt: new Date() };
    await getDb().pendingCalendarOps.add(full);
    return full;
  }

  async getAll(): Promise<PendingCalendarOp[]> {
    return getDb().pendingCalendarOps.toArray();
  }

  async update(id: string, patch: Partial<PendingCalendarOp>): Promise<void> {
    await getDb().pendingCalendarOps.update(id, patch);
  }

  async delete(id: string): Promise<void> {
    await getDb().pendingCalendarOps.delete(id);
  }
}

export const pendingCalendarOpsRepo: PendingCalendarOpsRepository = new DexiePendingCalendarOpsRepository();
