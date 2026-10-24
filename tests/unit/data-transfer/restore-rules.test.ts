/**
 * The rules a restore follows beyond "everything comes back" (docs/waves/wave-18.md):
 * what stays on the device, what a file without a record does, and the one path whose result depends
 * on the clock's time zone (habit logs derived again for a file that predates them).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { collectAll } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { diffTable } from './oracle/compare';
import { buildDataset, makeRow } from './oracle/dataset';
import { SECRET, ZONES, inZoneAsync, plantSecrets, primaryKeys, readDb, seedDb } from './oracle/harness';
import type { Row } from './oracle/tables';
import { intlDayKey } from '../planning/w10-helpers';

beforeEach(async () => {
  await resetDbForTesting();
});

async function roundTripped(json: string) {
  const parsed = parseEnvelope(json);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed;
}

describe('single-row records the backup does not carry', () => {
  it('a backup with no settings, streak or AI settings leaves the device\'s own untouched', async () => {
    const keys = primaryKeys();
    const data = buildDataset(11, 'full', keys);
    plantSecrets(data);
    await seedDb(data);
    const before = await readDb();

    const { envelope } = await roundTripped(JSON.stringify(await collectAll()));
    await replaceAll({ ...envelope, settings: null, streak: null, llmSettings: null });

    const after = await readDb();
    const problems: string[] = [];
    for (const table of ['settings', 'streak', 'llmSettings', 'tokens']) {
      problems.push(...diffTable(table, keys[table]!, before[table]!, after[table]!));
    }
    expect(problems.join('\n')).toBe('');
  });

  it('a record that is in the file but unusable is counted as skipped, and the device\'s copy stays', async () => {
    const keys = primaryKeys();
    const data = buildDataset(12, 'full', keys);
    await seedDb(data);
    const before = await readDb();

    const exported = JSON.parse(JSON.stringify(await collectAll())) as Record<string, unknown>;
    exported.settings = { id: 'singleton', theme: 'neon-green' };
    exported.streak = { id: 'singleton', currentStreakDays: 'many' };
    const parsed = await roundTripped(JSON.stringify(exported));
    expect(parsed.skipped).toBe(2);
    expect(parsed.envelope.settings).toBeNull();

    await replaceAll(parsed.envelope);
    const after = await readDb();
    expect(diffTable('settings', 'id', before.settings!, after.settings!)).toEqual([]);
    expect(diffTable('streak', 'id', before.streak!, after.streak!)).toEqual([]);
  });
});

describe('a file written before Wave 18 (it carries its own keys and feed link)', () => {
  it('restores what the file holds, and keeps the device\'s own for what the file lacks', async () => {
    const keys = primaryKeys();
    const data = buildDataset(13, 'full', keys);
    plantSecrets(data);
    const llm = data.llmSettings![0]! as { providers: Record<string, { apiKey: string; credentialSource?: string }> };
    for (const entry of Object.values(llm.providers)) entry.credentialSource = 'browser';
    const [first, second] = Object.keys(llm.providers);
    await seedDb(data);

    const old = JSON.parse(JSON.stringify(await collectAll())) as Record<string, any>;
    delete old.leftOut; // before Wave 18 there was no report
    old.llmSettings.providers[first!].apiKey = 'KEY-FROM-THE-OLD-FILE';
    delete old.llmSettings.providers[second!]; // the file does not name this provider at all
    old.settings.icsSubscriptionUrl = 'https://calendar.example.org/old/feed.ics';

    await replaceAll((await roundTripped(JSON.stringify(old))).envelope);
    const after = await readDb();
    const afterLlm = after.llmSettings![0]! as { providers: Record<string, { apiKey: string }> };
    expect(afterLlm.providers[first!]!.apiKey).toBe('KEY-FROM-THE-OLD-FILE');
    expect(afterLlm.providers[second!]).toBeUndefined();
    expect(after.settings![0]!.icsSubscriptionUrl).toBe('https://calendar.example.org/old/feed.ics');
    expect(after.tokens).toEqual(data.tokens); // never in a file, never removed by one
  });
});

describe('the report travels with the file', () => {
  it('is read back by the parser, so an import preview can show it', async () => {
    const data = buildDataset(16, 'full', primaryKeys());
    plantSecrets(data);
    await seedDb(data);
    const exported = await collectAll();
    const { envelope } = await roundTripped(JSON.stringify(exported));
    expect(envelope.leftOut).toEqual(exported.leftOut);
    expect(envelope.leftOut!.length).toBeGreaterThan(0);
  });

  it('is ignored, not trusted, when it is the wrong shape; the rest of the file still imports', async () => {
    await seedDb(buildDataset(17, 'full', primaryKeys()));
    const file = JSON.parse(JSON.stringify(await collectAll())) as Record<string, unknown>;
    file.leftOut = [{ id: 7, what: {}, count: 'lots' }];
    const parsed = await roundTripped(JSON.stringify(file));
    expect(parsed.envelope.leftOut).toBeUndefined();
    expect(parsed.skipped).toBe(0);
    expect(parsed.envelope.sessions.length).toBeGreaterThan(0);
  });
});

describe('export reports exactly what it left out', () => {
  it('counts keys, environment providers, the feed link, sign-in and waiting calendar updates', async () => {
    const keys = primaryKeys();
    const data = buildDataset(14, 'full', keys);
    plantSecrets(data);
    const provider = (name: string, credentialSource: 'browser' | 'environment', apiKey: string) => ({
      baseUrl: `https://${name}.example.org/v1`, model: 'm', apiKey, credentialSource,
    });
    (data.llmSettings![0]! as { providers: unknown }).providers = {
      withKey: provider('withKey', 'browser', SECRET.apiKey('withKey')),
      anotherKey: provider('anotherKey', 'browser', SECRET.apiKey('anotherKey')),
      noKeyYet: provider('noKeyYet', 'browser', ''), // nothing to leave out
      fromEnv: provider('fromEnv', 'environment', SECRET.apiKey('fromEnv')),
    };
    data.settings![0]!.icsSubscriptionUrl = SECRET.icsUrl;
    await seedDb(data);

    const said = Object.fromEntries((await collectAll()).leftOut!.map((item) => [item.id, item.count]));
    expect(said).toEqual({
      'llmSettings.apiKey': 2,
      'llmSettings.environmentProviders': 1,
      'settings.icsSubscriptionUrl': 1,
      tokens: 1,
      pendingCalendarOps: data.pendingCalendarOps!.length,
    });
  });

  it('says nothing is left out when there is nothing secret to leave out', async () => {
    await getDb().settings.clear();
    expect((await collectAll()).leftOut).toEqual([]);
  });
});

describe('export reads without writing', () => {
  it('does not touch the database it reads, even for an AI provider saved by an older build', async () => {
    const keys = primaryKeys();
    const data = buildDataset(15, 'sparse', keys);
    const llm = data.llmSettings![0]! as { providers: Record<string, Row> };
    // An older build wrote providers with no credentialSource; the repository's get() rewrites those.
    for (const entry of Object.values(llm.providers)) delete entry.credentialSource;
    await seedDb(data);
    const before = await readDb();
    await collectAll();
    const after = await readDb();
    const problems: string[] = [];
    for (const table of Object.keys(before)) problems.push(...diffTable(table, keys[table]!, before[table]!, after[table]!));
    expect(problems.join('\n')).toBe('');
  });
});

describe('a file that predates habit logs: derived again from sessions, on the local day (six zones)', () => {
  for (const zone of ZONES) {
    it(`${zone}: one log per session, dated by the local calendar day, none left from replaced sessions`, async () => {
      await inZoneAsync(zone, async () => {
        const habit = makeRow('habits', 21, {
          kind: 'timed', targetPerDay: 30, unit: undefined, linkedActivityLabel: 'Piano', linkedKataTemplateId: null,
          schedule: { kind: 'daily' }, archivedAt: null,
        });
        // Two sessions either side of local midnight, whatever the zone: the day must follow the zone.
        const dayStart = (y: number, m: number, d: number) => new Date(y, m - 1, d, 0, 0, 0, 0);
        const lateEvening = new Date(dayStart(2026, 3, 14).getTime() - 20 * 60_000); // 23:40 on the 13th, local
        const justAfter = new Date(dayStart(2026, 3, 15).getTime() + 10 * 60_000); // 00:10 on the 15th, local
        const sessions = [lateEvening, justAfter].map((startedAt, i) =>
          makeRow('sessions', 30 + i, { startedAt, durationMinutes: 20 + i, reps: null, activityLabel: 'piano', kataTemplateId: undefined }),
        );

        await seedDb({ habits: [habit] } as never);
        const staleSession = makeRow('sessions', 40, { startedAt: new Date(2026, 0, 2, 9), durationMinutes: 10, reps: null, activityLabel: 'Piano' });
        await getDb().sessions.put(staleSession as never);
        await getDb().habitLogs.put(makeRow('habitLogs', 41, { habitId: habit.id, source: 'session', sessionId: staleSession.id, date: '2026-01-02', minutes: 10 }) as never);

        // A file with sessions and nothing else: it never heard of habit logs.
        const file = { version: 2, exportedAt: new Date().toISOString(), sessions, reflections: [], streak: null, settings: null, llmSettings: null };
        await replaceAll((await roundTripped(JSON.stringify(file))).envelope);

        const logs = (await getDb().habitLogs.toArray()).sort((a, b) => a.date.localeCompare(b.date));
        expect(logs.map((l) => ({ date: l.date, minutes: l.minutes, sessionId: l.sessionId, habitId: l.habitId, source: l.source }))).toEqual(
          sessions.map((s) => ({
            date: intlDayKey(s.startedAt as Date, zone),
            minutes: s.durationMinutes,
            sessionId: s.id,
            habitId: habit.id,
            source: 'session',
          })).sort((a, b) => a.date.localeCompare(b.date)),
        );
        expect(logs.map((l) => l.date)).toEqual([intlDayKey(lateEvening, zone), intlDayKey(justAfter, zone)]);
        expect(new Set(logs.map((l) => l.date)).size).toBe(2); // the two sides of midnight are two days
      });
    });
  }
});
