import {
  ReviewDraftSchema,
  ReviewSchema,
  type Review,
  type ReviewDraft,
  type ReviewPatch,
} from '@/lib/schemas/review';
import { WeekKeySchema } from '@/lib/review/week';
import { getDb } from './db';

/**
 * Reviews and their resumable drafts (roadmap Wave 11).
 *
 * - Reads return `null`, never `undefined` (react-query v5 treats `undefined`
 *   as an error).
 * - A week key must be the local Monday that names the week; a non-Monday key
 *   is rejected instead of silently filing a review under a day.
 * - `complete()` writes the review and clears its draft in ONE transaction, so
 *   a failure leaves the draft exactly where the user left it.
 */
export interface ReviewRepository {
  getByWeek(weekOf: string): Promise<Review | null>;
  upsert(weekOf: string, patch: ReviewPatch, now?: Date): Promise<Review>;
  complete(weekOf: string, patch: ReviewPatch, now?: Date): Promise<Review>;
  delete(weekOf: string): Promise<void>;
  getDraft(weekOf: string): Promise<ReviewDraft | null>;
  /** The draft to resume, whatever week it belongs to; null when there is none. */
  latestDraft(): Promise<ReviewDraft | null>;
  saveDraft(
    weekOf: string,
    input: { step: number; decisions: Record<string, unknown> },
    now?: Date,
  ): Promise<ReviewDraft>;
  deleteDraft(weekOf: string): Promise<void>;
}

function weekOrThrow(weekOf: string): string {
  return WeekKeySchema.parse(weekOf);
}

export class DexieReviewRepository implements ReviewRepository {
  async getByWeek(weekOf: string): Promise<Review | null> {
    return (await getDb().reviews.get(weekOrThrow(weekOf))) ?? null;
  }

  async upsert(weekOf: string, patch: ReviewPatch, now: Date = new Date()): Promise<Review> {
    const week = weekOrThrow(weekOf);
    const db = getDb();
    return db.transaction('rw', db.reviews, async () => {
      const existing = await db.reviews.get(week);
      const review = ReviewSchema.parse({
        weekOf: week,
        notes: patch.notes ?? existing?.notes ?? '',
        statsSnapshot: patch.statsSnapshot ?? existing?.statsSnapshot,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      await db.reviews.put(review);
      return review;
    });
  }

  async complete(weekOf: string, patch: ReviewPatch, now: Date = new Date()): Promise<Review> {
    const week = weekOrThrow(weekOf);
    const db = getDb();
    return db.transaction('rw', db.reviews, db.reviewDrafts, async () => {
      const existing = await db.reviews.get(week);
      const review = ReviewSchema.parse({
        weekOf: week,
        notes: patch.notes ?? existing?.notes ?? '',
        statsSnapshot: patch.statsSnapshot ?? existing?.statsSnapshot,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      await db.reviews.put(review);
      await db.reviewDrafts.delete(week);
      return review;
    });
  }

  async delete(weekOf: string): Promise<void> {
    await getDb().reviews.delete(weekOrThrow(weekOf));
  }

  async getDraft(weekOf: string): Promise<ReviewDraft | null> {
    return (await getDb().reviewDrafts.get(weekOrThrow(weekOf))) ?? null;
  }

  async latestDraft(): Promise<ReviewDraft | null> {
    // Ordered by `updatedAt` (an index added in Dexie v8), so a draft started
    // last week is still found on Monday instead of being stranded by the
    // week key changing underneath it.
    return (await getDb().reviewDrafts.orderBy('updatedAt').last()) ?? null;
  }

  async saveDraft(
    weekOf: string,
    input: { step: number; decisions: Record<string, unknown> },
    now: Date = new Date(),
  ): Promise<ReviewDraft> {
    const draft = ReviewDraftSchema.parse({
      weekOf: weekOrThrow(weekOf),
      step: input.step,
      decisions: input.decisions,
      updatedAt: now,
    });
    await getDb().reviewDrafts.put(draft);
    return draft;
  }

  async deleteDraft(weekOf: string): Promise<void> {
    await getDb().reviewDrafts.delete(weekOrThrow(weekOf));
  }
}

export const reviewRepo: ReviewRepository = new DexieReviewRepository();
