import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTesting } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { saveSessionWithOutcome } from '@/lib/db/session-outcome.repo';
import { collectAll } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { CURRENT_ENVELOPE_VERSION } from '@/lib/data-transfer/types';

beforeEach(async () => {
  await resetDbForTesting();
});

describe('session outcome and breadcrumb in backups', () => {
  it('round-trips through the v2 envelope without a version bump', async () => {
    const task = await taskRepo.create({ title: 'write report', status: 'next', source: 'manual' });
    await saveSessionWithOutcome({
      startedAt: new Date(2026, 9, 23, 9, 0),
      durationMinutes: 25,
      rating: 4,
      taskId: task.id,
      outcome: 'blocked',
      breadcrumb: 'Pick up here next time: ask Ana for the figures',
    });

    const envelope = await collectAll();
    expect(envelope.version).toBe(CURRENT_ENVELOPE_VERSION);
    expect(envelope.sessions[0]).toMatchObject({
      outcome: 'blocked',
      breadcrumb: 'Pick up here next time: ask Ana for the figures',
    });

    const parsed = parseEnvelope(JSON.stringify(envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toBe(0);
    expect(parsed.envelope.sessions[0]).toMatchObject({ outcome: 'blocked' });
    expect(parsed.envelope.sessions[0]?.breadcrumb).toMatch(/ask Ana/);

    await resetDbForTesting();
    await replaceAll(parsed.envelope);
    const stored = await sessionRepo.getById(parsed.envelope.sessions[0]!.id);
    expect(stored?.outcome).toBe('blocked');
    expect(stored?.breadcrumb).toMatch(/ask Ana/);
  });

  it('still parses old sessions that have neither field', async () => {
    const session = await sessionRepo.save({
      startedAt: new Date(2026, 9, 23, 9, 0),
      durationMinutes: 20,
      rating: 3,
    });
    const envelope = await collectAll();
    const parsed = parseEnvelope(JSON.stringify(envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toBe(0);
    expect(parsed.envelope.sessions[0]?.outcome).toBeUndefined();
    expect(parsed.envelope.sessions[0]?.breadcrumb).toBeUndefined();
    expect(session.outcome).toBeUndefined();
  });

  it('rejects an invalid outcome value rather than storing it', async () => {
    const envelope = await collectAll();
    const raw = JSON.parse(JSON.stringify(envelope)) as { sessions: Array<Record<string, unknown>> };
    const legacy = { id: '123e4567-e89b-42d3-a456-426614174000', startedAt: new Date().toISOString(), durationMinutes: 10, rating: 3, outcome: 'finished', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    raw.sessions.push(legacy);

    const parsed = parseEnvelope(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toBe(1);
    expect(parsed.envelope.sessions.find((s) => s.id === legacy.id)).toBeUndefined();
  });
});
