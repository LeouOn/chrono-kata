import {
  ReviewDraftSchema,
  ReviewSchema,
  type Review,
  type ReviewDraft,
  type ReviewPatch,
} from '@/lib/schemas/review';
import { WeeklyStatsSchema } from '@/lib/review/stats';
import { WeekKeySchema } from '@/lib/review/week';
import { getDb } from './db';

/**
 * A draft is a few small decisions, never a document. This bound exists so a
 * wizard bug (or a pasted blob) cannot grow one draft row on every step.
 */
export const REVIEW_DECISIONS_MAX_BYTES = 64 * 1024;

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

/**
 * Assemble the review row a write will store.
 *
 * The snapshot is derived data whose schema will grow; a snapshot stored by an
 * older build must not make the review unsaveable. When it no longer validates,
 * it is dropped and the user's notes and intentions are kept.
 */
export function buildReview(
  existing: Review | undefined,
  weekOf: string,
  patch: ReviewPatch,
  now: Date,
): Review {
  const carriedSnapshot = patch.statsSnapshot ?? existing?.statsSnapshot;
  const statsSnapshot =
    carriedSnapshot && WeeklyStatsSchema.safeParse(carriedSnapshot).success
      ? carriedSnapshot
      : undefined;
  return ReviewSchema.parse({
    weekOf,
    notes: patch.notes ?? existing?.notes ?? '',
    statsSnapshot,
    nextWeekIntentions: patch.nextWeekIntentions ?? existing?.nextWeekIntentions,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

/** Byte size of a decisions payload, as it would be stored. */
export function decisionsByteSize(decisions: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(decisions)).length;
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
      const review = buildReview(existing, week, patch, now);
      await db.reviews.put(review);
      return review;
    });
  }

  async complete(weekOf: string, patch: ReviewPatch, now: Date = new Date()): Promise<Review> {
    const week = weekOrThrow(weekOf);
    const db = getDb();
    return db.transaction('rw', db.reviews, db.reviewDrafts, async () => {
      const existing = await db.reviews.get(week);
      const review = buildReview(existing, week, patch, now);
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
    if (decisionsByteSize(input.decisions) > REVIEW_DECISIONS_MAX_BYTES) {
      throw new Error('This draft grew too large to save. Nothing was changed.');
    }
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
