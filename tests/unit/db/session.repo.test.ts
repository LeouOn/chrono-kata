import { describe, it, expect, beforeEach } from 'vitest';
import { resetDbForTesting, type ChronoKataDB } from '@/lib/db/db';
import { DexieSessionRepository, sessionRepo } from '@/lib/db/session.repo';
import { conversationRepo } from '@/lib/db/conversation.repo';
import { messageRepo } from '@/lib/db/message.repo';
import type { Session, SessionInput } from '@/lib/schemas/session';

let db: ChronoKataDB;
let repo: DexieSessionRepository;

beforeEach(async () => {
  db = await resetDbForTesting();
  repo = new DexieSessionRepository();
});

const validInput: SessionInput = {
  startedAt: new Date('2026-07-21T10:00:00Z'),
  endedAt: new Date('2026-07-21T10:30:00Z'),
  durationMinutes: 30,
  reps: null,
  rating: 4,
  activityLabel: 'meditation',
  note: 'still mind',
};

describe('DexieSessionRepository', () => {
  it('saves a session and assigns id + timestamps', async () => {
    const saved = await repo.save(validInput);
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.coachComment).toBeNull();
    expect(saved.calendarEventId).toBeNull();
  });

  it('getAll returns sessions in reverse chronological order', async () => {
    await repo.save({ ...validInput, startedAt: new Date('2026-07-20T10:00:00Z') });
    await repo.save({ ...validInput, startedAt: new Date('2026-07-21T10:00:00Z') });
    const all = await repo.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.startedAt.getTime()).toBeGreaterThan(all[1]!.startedAt.getTime());
  });

  it('getByPeriod returns sessions in the date range', async () => {
    await repo.save({ ...validInput, startedAt: new Date('2026-07-15T10:00:00Z') });
    await repo.save({ ...validInput, startedAt: new Date('2026-07-20T10:00:00Z') });
    const result = await repo.getByPeriod(
      new Date('2026-07-18T00:00:00Z'),
      new Date('2026-07-22T00:00:00Z')
    );
    expect(result).toHaveLength(1);
  });

  it('update mutates only patched fields and bumps updatedAt', async () => {
    const saved = await repo.save(validInput);
    const originalUpdatedAt = saved.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.update(saved.id, { rating: 5 });
    expect(updated.rating).toBe(5);
    expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    expect(updated.activityLabel).toBe('meditation'); // untouched
  });

  it('delete removes the session', async () => {
    const saved = await repo.save(validInput);
    await repo.delete(saved.id);
    const all = await repo.getAll();
    expect(all).toHaveLength(0);
  });

  it('update throws on unknown id', async () => {
    await expect(repo.update('nonexistent', { rating: 5 })).rejects.toThrow();
  });
});

describe('Wave 11 lazy auto-migration', () => {
  it('getById on a session with coachComment creates a conversation + assistant message', async () => {
    const saved = await sessionRepo.save(validInput);
    // Simulate a pre-Wave-11 session by writing coachComment + clearing conversationId.
    const preWave11: Session = {
      ...saved,
      coachComment: 'an old coach comment',
      conversationId: undefined,
      coachPersonalityAtGeneration: 'zen',
    };
    await resetDbForTesting();
    await (await import('@/lib/db/db')).getDb().sessions.put(preWave11);

    const fetched = await sessionRepo.getById(preWave11.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.conversationId).toBeDefined();
    expect(fetched!.conversationId).not.toBeNull();

    const conv = await conversationRepo.getById(fetched!.conversationId as string);
    expect(conv).not.toBeNull();
    expect(conv!.sessionId).toBe(preWave11.id);
    expect(conv!.activeLeafId).not.toBeNull();

    const path = await messageRepo.getPathToLeaf(conv!.id, conv!.activeLeafId as string);
    expect(path).toHaveLength(1);
    expect(path[0]?.role).toBe('assistant');
    expect(path[0]?.content).toBe('an old coach comment');
  });

  it('getById on a session without coachComment does not migrate', async () => {
    const saved = await sessionRepo.save(validInput);
    // No coachComment; migration should be a no-op.
    const preWave11: Session = { ...saved, coachComment: null, conversationId: undefined };
    await resetDbForTesting();
    await (await import('@/lib/db/db')).getDb().sessions.put(preWave11);

    const fetched = await sessionRepo.getById(preWave11.id);
    expect(fetched!.conversationId).toBeUndefined();
  });

  it('repeated getById is idempotent', async () => {
    const saved = await sessionRepo.save(validInput);
    const preWave11: Session = { ...saved, coachComment: 'msg', conversationId: undefined };
    await resetDbForTesting();
    await (await import('@/lib/db/db')).getDb().sessions.put(preWave11);

    const first = await sessionRepo.getById(preWave11.id);
    const firstConvId = first!.conversationId;
    const second = await sessionRepo.getById(preWave11.id);
    expect(second!.conversationId).toBe(firstConvId);

    const convs = await (await import('@/lib/db/db')).getDb().conversations.where('sessionId').equals(preWave11.id).toArray();
    expect(convs).toHaveLength(1);
  });
});
