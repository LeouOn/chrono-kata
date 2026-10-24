import { beforeEach, describe, expect, it } from 'vitest';
import legacyEnvelopeJson from '../../fixtures/backup-envelope-v2.json';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { reviewRepo } from '@/lib/db/review.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { collectAll } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import type { ExportEnvelopeV2 } from '@/lib/data-transfer/types';
import { summarizeWeek } from '@/lib/review/stats';
import { DOMAIN_SEED_IDS } from '@/lib/db/seed-domains';

const WEEK = '2026-06-15';
const NEXT_WEEK = '2026-06-22';
const ISO = '2026-06-21T18:00:00.000Z';

/** Compare envelopes structurally: order is not part of the data. */
function dropUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => dropUndefined(entry)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, dropUndefined(entry)]),
    ) as T;
  }
  return value;
}

function sorted(envelope: ExportEnvelopeV2) {
  const byId = (rows: { id: string }[] | undefined) =>
    rows === undefined ? undefined : [...rows].sort((a, b) => a.id.localeCompare(b.id));
  return {
    ...envelope,
    exportedAt: undefined,
    sessions: byId(envelope.sessions),
    reflections: byId(envelope.reflections),
    kataTemplates: byId(envelope.kataTemplates),
    conversations: byId(envelope.conversations),
    messages: byId(envelope.messages),
    habits: byId(envelope.habits),
    habitLogs: byId(envelope.habitLogs),
    domains: byId(envelope.domains),
    projects: byId(envelope.projects),
    tasks: byId(envelope.tasks),
    blocks: byId(envelope.blocks),
    estimates: byId(envelope.estimates),
    checkIns: envelope.checkIns && [...envelope.checkIns].sort((a, b) => a.date.localeCompare(b.date)),
    dayPlans: envelope.dayPlans && [...envelope.dayPlans].sort((a, b) => a.date.localeCompare(b.date)),
    reviews: envelope.reviews && [...envelope.reviews].sort((a, b) => a.weekOf.localeCompare(b.weekOf)),
    reviewDrafts:
      envelope.reviewDrafts && [...envelope.reviewDrafts].sort((a, b) => a.weekOf.localeCompare(b.weekOf)),
  };
}

async function seedRealisticWeek(): Promise<void> {
  const trading = await taskRepo.create({
    title: 'Review the trading journal',
    status: 'next',
    domainId: DOMAIN_SEED_IDS.trading,
    estimateMin: 30,
    source: 'manual',
  });
  const career = await taskRepo.create({
    title: 'Ship the weekly review',
    status: 'next',
    domainId: DOMAIN_SEED_IDS.career,
    estimateMin: 60,
    source: 'manual',
  });
  await sessionRepo.save({
    startedAt: new Date('2026-06-16T09:00:00'),
    endedAt: new Date('2026-06-16T09:42:30'),
    durationMinutes: 42.5,
    reps: null,
    rating: 4,
    taskId: trading.id,
    outcome: 'done',
  });
  await sessionRepo.save({
    startedAt: new Date('2026-06-18T14:00:00'),
    endedAt: new Date('2026-06-18T14:25:00'),
    durationMinutes: 25,
    reps: null,
    rating: 3,
    taskId: career.id,
    outcome: 'blocked',
  });

  const tasks = await getDb().tasks.toArray();
  const sessions = await getDb().sessions.toArray();
  const domains = await getDb().domains.toArray();
  const snapshot = summarizeWeek({
    weekOf: WEEK,
    sessions,
    tasks,
    projects: [],
    domains,
    now: new Date('2026-06-21T20:00:00'),
  });

  await reviewRepo.complete(WEEK, { notes: 'first week: steady', statsSnapshot: snapshot });
  await reviewRepo.upsert(NEXT_WEEK, { notes: 'second week: lighter' });
  await reviewRepo.saveDraft(NEXT_WEEK, { step: 3, decisions: { kept: [trading.id], shape: 'two' } });
}

beforeEach(async () => {
  await resetDbForTesting();
});

describe('review backup round trip', () => {
  it('survives export -> parse -> replaceAll, twice, with nothing drifting', async () => {
    await seedRealisticWeek();
    const before = await collectAll();
    expect(before.version).toBe(2); // envelope version unchanged; the tables ride as optional fields
    expect(before.reviews).toHaveLength(2);
    expect(before.reviewDrafts).toHaveLength(1);

    const first = parseEnvelope(JSON.stringify(before));
    if (!first.ok) throw new Error(first.error);
    expect(first.skipped).toBe(0);

    await resetDbForTesting();
    await replaceAll(first.envelope);
    const afterFirst = await collectAll();
    expect(dropUndefined(sorted(afterFirst))).toEqual(dropUndefined(sorted(before)));

    // Oracle: importing the same data a second time changes nothing.
    const second = parseEnvelope(JSON.stringify(afterFirst));
    if (!second.ok) throw new Error(second.error);
    expect(second.skipped).toBe(0);
    await replaceAll(second.envelope);
    expect(dropUndefined(sorted(await collectAll()))).toEqual(dropUndefined(sorted(afterFirst)));

    // Dates come back as Dates, and the snapshot stays a typed object.
    const review = await reviewRepo.getByWeek(WEEK);
    expect(review?.createdAt).toBeInstanceOf(Date);
    expect(review?.statsSnapshot?.sessions).toEqual({ total: 2, moved: 1, stalled: 1, withoutOutcome: 0, minutes: 67.5 });
    expect(review?.statsSnapshot?.weekOf).toBe(WEEK);
    const journalTask = afterFirst.tasks?.find((task) => task.title === 'Review the trading journal');
    const draft = await reviewRepo.getDraft(NEXT_WEEK);
    expect(draft?.step).toBe(3);
    expect(draft?.decisions).toEqual({ kept: [journalTask?.id], shape: 'two' });
  });
});

describe('older files', () => {
  it('leaves local reviews untouched when the file predates them', async () => {
    await seedRealisticWeek();
    const parsed = parseEnvelope(JSON.stringify(legacyEnvelopeJson));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.envelope.reviews).toBeUndefined();
    expect(parsed.envelope.reviewDrafts).toBeUndefined();

    await replaceAll(parsed.envelope);
    expect(await reviewRepo.getByWeek(WEEK)).not.toBeNull();
    expect(await reviewRepo.getDraft(NEXT_WEEK)).not.toBeNull();
  });
});

describe('row validation', () => {
  it('skips invalid reviews and drafts, and counts them', async () => {
    const raw = {
      version: 2,
      exportedAt: ISO,
      sessions: [],
      reviews: [
        { weekOf: WEEK, notes: 'ok', createdAt: ISO, updatedAt: ISO },
        { weekOf: '2026-06-17', notes: 'not a Monday', createdAt: ISO, updatedAt: ISO },
        { weekOf: NEXT_WEEK, notes: 'z'.repeat(10_001), createdAt: ISO, updatedAt: ISO },
        { weekOf: '2026-06-29', notes: 'no dates' },
      ],
      reviewDrafts: [
        { weekOf: WEEK, step: 3, decisions: { a: 1 }, updatedAt: ISO },
        { weekOf: WEEK, step: 9, decisions: {}, updatedAt: ISO },
        { weekOf: '2026-06-17', step: 0, decisions: {}, updatedAt: ISO },
      ],
    };
    const result = parseEnvelope(JSON.stringify(raw));
    if (!result.ok) throw new Error(result.error);
    expect(result.skipped).toBe(5);
    expect(result.envelope.reviews).toHaveLength(1);
    expect(result.envelope.reviewDrafts).toHaveLength(1);
    expect(result.envelope.reviewDrafts?.[0]?.step).toBe(3);
  });

  it('keeps the notes when only the derived stats snapshot is stale', async () => {
    // A snapshot written by an older build: its schema grows over the waves, so
    // a field this version does not know must never cost the user their writing.
    const raw = {
      version: 2,
      exportedAt: ISO,
      sessions: [],
      reviews: [
        {
          weekOf: WEEK,
          notes: 'my own words, written on Sunday evening',
          statsSnapshot: { weekOf: WEEK, futureField: true },
          createdAt: ISO,
          updatedAt: ISO,
        },
      ],
    };
    const result = parseEnvelope(JSON.stringify(raw));
    if (!result.ok) throw new Error(result.error);
    expect(result.skipped).toBe(0);
    expect(result.snapshotsDropped).toBe(1);
    expect(result.envelope.reviews).toHaveLength(1);
    expect(result.envelope.reviews?.[0]?.notes).toBe('my own words, written on Sunday evening');
    expect(result.envelope.reviews?.[0]?.statsSnapshot).toBeUndefined();

    await replaceAll(result.envelope);
    expect((await reviewRepo.getByWeek(WEEK))?.notes).toBe('my own words, written on Sunday evening');
  });

  it('still skips a review that is invalid for its own reasons, snapshot or not', () => {
    const raw = {
      version: 2,
      exportedAt: ISO,
      sessions: [],
      reviews: [
        {
          weekOf: '2026-06-17', // not a Monday
          notes: 'unfiled',
          statsSnapshot: { weekOf: WEEK, futureField: true },
          createdAt: ISO,
          updatedAt: ISO,
        },
        {
          weekOf: NEXT_WEEK,
          notes: 'z'.repeat(10_001), // over the notes bound
          statsSnapshot: { weekOf: NEXT_WEEK, futureField: true },
          createdAt: ISO,
          updatedAt: ISO,
        },
      ],
    };
    const result = parseEnvelope(JSON.stringify(raw));
    if (!result.ok) throw new Error(result.error);
    expect(result.skipped).toBe(2);
    expect(result.snapshotsDropped).toBe(0);
    expect(result.envelope.reviews).toEqual([]);
  });

  it('rejects a reviews key that is not an array', () => {
    const result = parseEnvelope(JSON.stringify({ version: 2, exportedAt: ISO, sessions: [], reviews: {} }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('reviews');
  });

  it('clears local reviews when the file carries an empty list', async () => {
    await seedRealisticWeek();
    const empty = await (async () => {
      await resetDbForTesting();
      return collectAll();
    })();
    expect(empty.reviews).toEqual([]);

    await replaceAll(empty);
    expect(await getDb().reviews.count()).toBe(0);
    expect(await getDb().reviewDrafts.count()).toBe(0);
  });
});
