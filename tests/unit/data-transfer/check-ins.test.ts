import { describe, it, expect, beforeEach } from 'vitest';
import { collectAll } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { migrateEnvelope } from '@/lib/data-transfer/migrate';
import { checkInRepo } from '@/lib/db/check-in.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { resetDbForTesting } from '@/lib/db/db';

beforeEach(async () => {
  await resetDbForTesting();
});

const T = '2026-09-20T08:00:00.000Z';

/** A v1 backup as written by exports before check-ins existed. */
const v1File = {
  version: 1,
  exportedAt: T,
  sessions: [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      startedAt: T,
      endedAt: null,
      durationMinutes: 30,
      reps: null,
      rating: 4,
      createdAt: T,
      updatedAt: T,
    },
  ],
  reflections: [],
  streak: null,
  settings: null,
  llmSettings: null,
};

function checkInRow(date: string, energy = 3) {
  return { date, energy, fog: 2, aches: 1, sleep: 4, createdAt: T, updatedAt: T };
}

describe('migrateEnvelope', () => {
  it('upgrades v1 to v2 with checkIns absent', () => {
    const result = migrateEnvelope({ ...v1File });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.raw.version).toBe(2);
    expect(result.raw.checkIns).toBeUndefined();
    expect(result.raw.sessions).toBe(v1File.sessions);
  });

  it('passes v2 through unchanged', () => {
    const raw = { ...v1File, version: 2, checkIns: [checkInRow('2026-09-20')] };
    const result = migrateEnvelope(raw);
    expect(result.ok && result.raw).toBe(raw);
  });

  it('rejects missing and unknown versions', () => {
    expect(migrateEnvelope({ sessions: [] }).ok).toBe(false);
    expect(migrateEnvelope({ ...v1File, version: 3 }).ok).toBe(false);
    expect(migrateEnvelope({ ...v1File, version: '1' }).ok).toBe(false);
  });
});

describe('check-ins in backups', () => {
  it('imports a v1 file cleanly and keeps local check-ins', async () => {
    await checkInRepo.upsert({ date: '2026-09-24', energy: 2, fog: 4, aches: 3, sleep: 2 });

    const parsed = parseEnvelope(JSON.stringify(v1File));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.version).toBe(2);
    expect(parsed.envelope.checkIns).toBeUndefined();
    expect(parsed.skipped).toBe(0);

    await replaceAll(parsed.envelope);

    expect(await sessionRepo.getAll()).toHaveLength(1);
    expect((await checkInRepo.getAll()).map((c) => c.date)).toEqual(['2026-09-24']);
  });

  it('round-trips check-ins through a v2 export', async () => {
    await checkInRepo.upsert({ date: '2026-09-23', energy: 2, fog: 4, aches: 3, sleep: 2, note: 'Crashed after the long walk' });
    await checkInRepo.upsert({ date: '2026-09-24', energy: 4, fog: 1, aches: 1, sleep: 5 });
    const before = await checkInRepo.getAll();

    const json = JSON.stringify(await collectAll());
    await resetDbForTesting();
    expect(await checkInRepo.getAll()).toHaveLength(0);

    const parsed = parseEnvelope(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await replaceAll(parsed.envelope);

    const after = await checkInRepo.getAll();
    expect(after).toEqual(before);
    expect(after[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('a v2 file replaces local check-ins, including with an empty list', async () => {
    await checkInRepo.upsert({ date: '2026-09-24', energy: 2, fog: 4, aches: 3, sleep: 2 });

    const parsed = parseEnvelope(JSON.stringify({ ...v1File, version: 2, checkIns: [] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await replaceAll(parsed.envelope);

    expect(await checkInRepo.getAll()).toEqual([]);
  });

  it('skips invalid and duplicate check-in rows', () => {
    const parsed = parseEnvelope(
      JSON.stringify({
        ...v1File,
        version: 2,
        checkIns: [
          checkInRow('2026-09-20', 3),
          checkInRow('2026-09-20', 5), // duplicate date
          checkInRow('2026-09-21', 7), // out of range
          { ...checkInRow('2026-09-22'), createdAt: 'not a date' },
          checkInRow('22.09.2026'),
          'garbage',
        ],
      })
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.checkIns?.map((c) => [c.date, c.energy])).toEqual([['2026-09-20', 3]]);
    expect(parsed.skipped).toBe(5);
  });

  it('rejects a file whose checkIns is not an array', () => {
    const parsed = parseEnvelope(JSON.stringify({ ...v1File, version: 2, checkIns: {} }));
    expect(parsed.ok).toBe(false);
  });
});
