import {
  EstimateSchema,
  EstimateInputSchema,
  type Estimate,
  type EstimateInput,
} from '@/lib/schemas/estimate';
import { newId } from '@/lib/utils/id';
import { getDb } from './db';

export interface EstimateRepository {
  byTask(taskId: string): Promise<Estimate[]>;
  create(input: EstimateInput): Promise<Estimate>;
  delete(id: string): Promise<void>;
}

export class DexieEstimateRepository implements EstimateRepository {
  async byTask(taskId: string): Promise<Estimate[]> {
    const rows = await getDb().estimates.where('taskId').equals(taskId).toArray();
    return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async create(input: EstimateInput): Promise<Estimate> {
    const parsed = EstimateInputSchema.parse(input);
    const now = new Date();
    const estimate: Estimate = EstimateSchema.parse({
      ...parsed,
      id: newId(),
      createdAt: now,
      updatedAt: now,
    });
    await getDb().estimates.put(estimate);
    return estimate;
  }

  async delete(id: string): Promise<void> {
    await getDb().estimates.delete(id);
  }
}

export const estimateRepo: EstimateRepository = new DexieEstimateRepository();
