import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { reviewRepo } from '@/lib/db/review.repo';
import { summarizeWeek } from '@/lib/review/stats';
import type { Domain } from '@/lib/schemas/domain';

const WEEK = '2026-06-15';
const NEXT_WEEK = '2026-06-22';

const DOMAIN: Domain = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Trading',
  order: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const snapshot = summarizeWeek({
  weekOf: WEEK,
  sessions: [],
  tasks: [],
  projects: [],
  domains: [DOMAIN],
  now: new Date('2026-06-21T12:00:00'),
});

beforeEach(async () => {
  await resetDbForTesting();
});

describe('reading', () => {
  it('returns null, not undefined, for a week with no review or draft', async () => {
    expect(await reviewRepo.getByWeek(WEEK)).toBeNull();
    expect(await reviewRepo.getDraft(WEEK)).toBeNull();
    expect(await reviewRepo.latestDraft()).toBeNull();
  });

  it('files every write under the Monday that names the week', async () => {
    await expect(reviewRepo.upsert('2026-06-17', { notes: 'mid-week' })).rejects.toThrow();
    await expect(reviewRepo.saveDraft('2026-06-17', { step: 0, decisions: {} })).rejects.toThrow();
    expect(await getDb().reviews.count()).toBe(0);
    expect(await getDb().reviewDrafts.count()).toBe(0);
  });
});

describe('upsert', () => {
  it('keeps the original createdAt and the snapshot it was given', async () => {
    const first = await reviewRepo.upsert(WEEK, { notes: 'first', statsSnapshot: snapshot }, new Date('2026-06-21T18:00:00'));
    const second = await reviewRepo.upsert(WEEK, { notes: 'second' }, new Date('2026-06-22T09:00:00'));
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(second.updatedAt.getTime()).toBe(new Date('2026-06-22T09:00:00').getTime());
    expect(second.notes).toBe('second');
    expect(second.statsSnapshot).toEqual(snapshot);
    expect(await getDb().reviews.count()).toBe(1);
  });

  it('accepts the schema limit and rejects one character more without writing', async () => {
    await reviewRepo.upsert(WEEK, { notes: 'x'.repeat(10_000) });
    expect((await reviewRepo.getByWeek(WEEK))?.notes).toHaveLength(10_000);

    await expect(reviewRepo.upsert(NEXT_WEEK, { notes: 'y'.repeat(10_001) })).rejects.toThrow();
    expect(await reviewRepo.getByWeek(NEXT_WEEK)).toBeNull();
  });
});

describe('drafts and pause/resume', () => {
  it('saves progress and finds the most recent draft even after the week key moved on', async () => {
    await reviewRepo.saveDraft(WEEK, { step: 2, decisions: { dropped: ['t1'] } }, new Date('2026-06-21T20:00:00'));
    await reviewRepo.saveDraft(NEXT_WEEK, { step: 1, decisions: { inbox: 3 } }, new Date('2026-06-23T08:00:00'));

    const latest = await reviewRepo.latestDraft();
    expect(latest?.weekOf).toBe(NEXT_WEEK);
    expect(latest?.step).toBe(1);
    expect(latest?.decisions).toEqual({ inbox: 3 });

    // Going Back to an earlier week still resumes that week's own draft.
    expect((await reviewRepo.getDraft(WEEK))?.step).toBe(2);
  });

  it('updates one draft row rather than accumulating rows per week', async () => {
    await reviewRepo.saveDraft(WEEK, { step: 0, decisions: {} }, new Date('2026-06-21T20:00:00'));
    await reviewRepo.saveDraft(WEEK, { step: 3, decisions: { shape: 'lighter' } }, new Date('2026-06-21T20:10:00'));
    expect(await getDb().reviewDrafts.count()).toBe(1);
    expect((await reviewRepo.getDraft(WEEK))?.decisions).toEqual({ shape: 'lighter' });
  });

  it('rejects a step outside the six-step wizard', async () => {
    await expect(reviewRepo.saveDraft(WEEK, { step: 6, decisions: {} })).rejects.toThrow();
    await expect(reviewRepo.saveDraft(WEEK, { step: -1, decisions: {} })).rejects.toThrow();
    expect(await getDb().reviewDrafts.count()).toBe(0);
  });
});

describe('complete', () => {
  it('writes the review and clears its draft in one transaction', async () => {
    await reviewRepo.saveDraft(WEEK, { step: 5, decisions: { shape: 'two sessions of Trading' } });
    const review = await reviewRepo.complete(WEEK, { notes: 'good week', statsSnapshot: snapshot });
    expect(review.notes).toBe('good week');
    expect(review.statsSnapshot).toEqual(snapshot);
    expect(await reviewRepo.getByWeek(WEEK)).toEqual(review);
    expect(await reviewRepo.getDraft(WEEK)).toBeNull();
  });

  it('rolls the whole completion back when clearing the draft fails', async () => {
    const draft = await reviewRepo.saveDraft(WEEK, { step: 5, decisions: { kept: true } });
    const db = getDb();
    const spy = vi
      .spyOn(db.reviewDrafts, 'delete')
      .mockRejectedValueOnce(new Error('storage went away'));
    await expect(reviewRepo.complete(WEEK, { notes: 'should not stick' })).rejects.toThrow(
      'storage went away',
    );
    spy.mockRestore();

    // The review write was inside the same transaction, so it is gone too.
    expect(await reviewRepo.getByWeek(WEEK)).toBeNull();
    // And the draft is exactly as the user left it.
    expect(await reviewRepo.getDraft(WEEK)).toEqual(draft);
  });

  it('leaves a completed review editable without re-creating a draft', async () => {
    const first = await reviewRepo.complete(WEEK, { notes: 'done' });
    await reviewRepo.saveDraft(WEEK, { step: 4, decisions: {} });
    const second = await reviewRepo.complete(WEEK, { notes: 'edited after resuming' });
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(await reviewRepo.getDraft(WEEK)).toBeNull();
  });
});

describe('delete', () => {
  it('deletes a review and leaves the draft alone', async () => {
    await reviewRepo.upsert(WEEK, { notes: 'to delete' });
    await reviewRepo.saveDraft(WEEK, { step: 1, decisions: {} });
    await reviewRepo.delete(WEEK);
    expect(await reviewRepo.getByWeek(WEEK)).toBeNull();
    expect(await reviewRepo.getDraft(WEEK)).not.toBeNull();
  });
});
