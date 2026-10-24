import { BlockSchema, BlockInputSchema, type Block, type BlockInput } from '@/lib/schemas/block';
import { newId } from '@/lib/utils/id';
import { getDb } from './db';

export interface BlockRepository {
  getAll(): Promise<Block[]>;
  getById(id: string): Promise<Block | undefined>;
  /** Blocks overlapping [from, to) — blocks may straddle the boundary. */
  range(from: Date, to: Date): Promise<Block[]>;
  byKind(kind: Block['kind']): Promise<Block[]>;
  create(input: BlockInput): Promise<Block>;
  update(id: string, patch: Partial<BlockInput>): Promise<Block>;
  delete(id: string): Promise<void>;
  /**
   * Wave 8 part 2: apply a reconciled calendar import in ONE transaction.
   * Rollback on any failure — no partial import.
   */
  applyCalendarImport(blocks: readonly Block[], now?: Date): Promise<void>;
  /**
   * Replace the not-yet-started focus blocks inside a waking window with a
   * proposed layout, atomically. Blocks whose start is at or before `now`
   * already happened and are kept, so a replan never rewrites history.
   */
  replaceFutureFocus(
    window: { start: Date; end: Date },
    now: Date,
    blocks: readonly { taskId: string; start: number; end: number }[],
  ): Promise<void>;
}

export class DexieBlockRepository implements BlockRepository {
  async getAll(): Promise<Block[]> {
    const all = await getDb().blocks.toArray();
    return all.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  async getById(id: string): Promise<Block | undefined> {
    return getDb().blocks.get(id);
  }

  async range(from: Date, to: Date): Promise<Block[]> {
    // Blocks starting before `to` that end after `from` (overlap), via the
    // start index: candidates are starts below `to`, then filter by end.
    const candidates = await getDb().blocks.where('start').below(to).toArray();
    return candidates
      .filter((b) => b.end > from)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  async byKind(kind: Block['kind']): Promise<Block[]> {
    return getDb().blocks.where('kind').equals(kind).toArray();
  }

  async create(input: BlockInput): Promise<Block> {
    const parsed = BlockInputSchema.parse(input);
    const now = new Date();
    const block: Block = BlockSchema.parse({
      ...parsed,
      id: newId(),
      createdAt: now,
      updatedAt: now,
    });
    await getDb().blocks.put(block);
    return block;
  }

  async update(id: string, patch: Partial<BlockInput>): Promise<Block> {
    const db = getDb();
    return db.transaction('rw', db.blocks, async () => {
      const existing = await db.blocks.get(id);
      if (!existing) throw new Error(`Block ${id} not found`);
      const updated = BlockSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      });
      await db.blocks.put(updated);
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    await getDb().blocks.delete(id);
  }

  /**
   * Wave 8 part 2: apply a reconciled calendar import in ONE transaction.
   * Every block in `blocks` comes from buildImportPreview and carries a
   * calendarRef; hand-made blocks are structurally invisible to the plan
   * (the pure layer never emits them). A failure anywhere rolls the whole
   * write back — no partial import.
   */
  async applyCalendarImport(blocks: readonly Block[], now: Date = new Date()): Promise<void> {
    const db = getDb();
    await db.transaction('rw', db.blocks, async () => {
      for (const block of blocks) {
        const parsed = BlockSchema.parse({ ...block, updatedAt: now });
        await db.blocks.put(parsed);
      }
    });
  }

  async replaceFutureFocus(
    window: { start: Date; end: Date },
    now: Date,
    blocks: readonly { taskId: string; start: number; end: number }[],
  ): Promise<void> {
    const db = getDb();
    await db.transaction('rw', db.blocks, async () => {
      const candidates = await db.blocks.where('start').below(window.end).toArray();
      for (const block of candidates) {
        if (block.kind !== 'focus') continue;
        if (block.end <= window.start) continue;
        if (block.start.getTime() <= now.getTime()) continue;
        await db.blocks.delete(block.id);
      }
      const timestamp = new Date();
      for (const proposed of blocks) {
        const block: Block = BlockSchema.parse({
          id: newId(),
          start: new Date(proposed.start),
          end: new Date(proposed.end),
          kind: 'focus',
          title: 'Focus',
          taskId: proposed.taskId,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        await db.blocks.add(block);
      }
    });
  }
}

export const blockRepo: BlockRepository = new DexieBlockRepository();
