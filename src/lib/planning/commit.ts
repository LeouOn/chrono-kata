import { BlockSchema } from '@/lib/schemas/block';
import { getDb } from '@/lib/db/db';
import { newId } from '@/lib/utils/id';
import type { ProposedBlock } from '@/lib/planning/layout';

export interface CommitLayoutInput {
  dayKey: string;
  window: { start: number; end: number };
  now: number;
  blocks: readonly ProposedBlock[];
  /** Picks that did not fit and go back to the list. */
  overflowTaskIds?: readonly string[];
  /** The day's picks after the replan, written when overflow is returned. */
  picks?: readonly string[];
}

/**
 * One transaction for applying a layout: replace the day's not-yet-started
 * focus blocks, put overflow picks back on the task list (status `next`,
 * everything else untouched) and, when overflow exists, write the day's picks
 * so those tasks stop being promised for today. A failure rolls all of it back.
 */
export async function commitLayout(input: CommitLayoutInput): Promise<void> {
  const db = getDb();
  const windowStart = new Date(input.window.start);
  const windowEnd = new Date(input.window.end);
  const now = new Date(input.now);
  const overflow = new Set(input.overflowTaskIds ?? []);
  await db.transaction('rw', db.blocks, db.dayPlans, db.tasks, async () => {
    const candidates = await db.blocks.where('start').below(windowEnd).toArray();
    for (const block of candidates) {
      if (block.kind !== 'focus') continue;
      if (block.end <= windowStart) continue;
      if (block.start.getTime() <= now.getTime()) continue;
      await db.blocks.delete(block.id);
    }
    const timestamp = new Date();
    for (const proposed of input.blocks) {
      const block = BlockSchema.parse({
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
    if (input.picks) {
      const existing = await db.dayPlans.get(input.dayKey);
      const picks = [...input.picks];
      if (existing) {
        await db.dayPlans.put({ ...existing, picks, updatedAt: timestamp });
      } else if (picks.length > 0) {
        await db.dayPlans.put({
          date: input.dayKey,
          picks,
          capacityMin: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
    for (const taskId of overflow) {
      const task = await db.tasks.get(taskId);
      if (task && task.status !== 'next') {
        await db.tasks.put({ ...task, status: 'next', touchedAt: timestamp });
      }
    }
  });
}
