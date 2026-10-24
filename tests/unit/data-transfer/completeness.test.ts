/**
 * THE COMPLETENESS ORACLE (roadmap Wave 18, PR 1).
 *
 * "Export, wipe, import restores everything identically" is only worth saying if a test can fail when it
 * stops being true. So this test derives its expectations from the CODE, not from a list someone keeps:
 *
 *  - the TABLE list is `getDb().tables`: a table that is neither exported nor explicitly left out (with a
 *    reason) fails here the day it is added;
 *  - the FIELD list is each table's Zod schema: rows are GENERATED from the schema, with every optional
 *    field filled (`full`) and with optional fields randomly absent / nullable ones randomly null
 *    (`sparse`), so a field added to a schema next month is seeded, exported, imported and compared with
 *    nobody updating a fixture;
 *  - the check is a deep comparison, row by row against Dexie, dates as Dates, `null` kept distinct from
 *    absent, across six time zones.
 *
 * Expected, documented differences are the SECRETS RULE (docs/waves/wave-18.md): API keys, Google
 * sign-in tokens and the private calendar-feed URL never travel in a plain backup, and a restore never
 * removes the ones already on the device. Everything else must come back identical.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { collectAll } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { diffTable } from './oracle/compare';
import { buildDataset, type Dataset } from './oracle/dataset';
import { SECRET, ZONES, inZoneAsync, plantSecrets, primaryKeys, readDb, secretStrings, seedDb, tableNames } from './oracle/harness';
import { LEFT_OUT, TABLE_SPECS, type Row } from './oracle/tables';
import { leafPaths, rowsCover } from './oracle/zod-gen';

const SEEDS = [101, 202];
const MODES = ['full', 'sparse'] as const;

/** Every generated row of every run, to prove the oracle exercised every field of every schema. */
const generated: Record<string, Row[]> = {};
const remember = (data: Dataset) => {
  for (const [table, rows] of Object.entries(data)) (generated[table] ??= []).push(...rows);
};

beforeEach(async () => {
  await resetDbForTesting();
});

/** What a plain backup is allowed to change on the way back in (the secrets rule). */
function expectedAfterRestoreOnAnotherDevice(data: Dataset): Dataset {
  const out: Dataset = {};
  for (const [table, rows] of Object.entries(data)) {
    if (table in LEFT_OUT) continue; // not in the file at all
    out[table] = rows.map((row) => ({ ...row }));
  }
  const llm = out.llmSettings![0]! as { providers: Record<string, { apiKey: string; credentialSource?: string }> };
  llm.providers = Object.fromEntries(
    Object.entries(llm.providers)
      .filter(([, entry]) => entry.credentialSource !== 'environment')
      .map(([name, entry]) => [name, { ...entry, apiKey: '' }]),
  );
  const settings = out.settings![0]!;
  delete settings.icsSubscriptionUrl;
  if (settings.googleCalendarConnectedAt != null) settings.googleCalendarConnectedAt = null; // no sign-in on a new device
  return out;
}

describe('the oracle knows every table', () => {
  it('every Dexie table has a schema entry and is either exported or explicitly left out', async () => {
    const data = buildDataset(7, 'full', primaryKeys());
    await seedDb(data);
    const envelope = (await collectAll()) as unknown as Record<string, unknown>;
    const problems: string[] = [];
    for (const name of tableNames()) {
      if (!(name in TABLE_SPECS)) problems.push(`${name}: no schema entry in oracle/tables.ts`);
      const exported = envelope[name] !== undefined;
      const leftOut = name in LEFT_OUT;
      if (!exported && !leftOut) problems.push(`${name}: neither exported nor listed in LEFT_OUT (with a reason)`);
      if (exported && leftOut) problems.push(`${name}: listed as left out but the export carries it`);
    }
    for (const name of Object.keys(TABLE_SPECS)) {
      if (!tableNames().includes(name)) problems.push(`${name}: oracle entry for a table that no longer exists`);
    }
    for (const name of Object.keys(LEFT_OUT)) {
      if (!(name in TABLE_SPECS)) problems.push(`${name}: LEFT_OUT entry for an unknown table`);
    }
    expect(problems.join('\n')).toBe('');
  });

  it('the export SAYS what it leaves out, for every table that is left out', async () => {
    await seedDb(buildDataset(8, 'full', primaryKeys()));
    const envelope = await collectAll();
    const said = (envelope.leftOut ?? []).map((item) => item.id);
    for (const table of Object.keys(LEFT_OUT)) expect(said, `the export does not say it left out ${table}`).toContain(table);
    // ...and with a count, so the person can see how much, not just what.
    expect(envelope.leftOut!.find((item) => item.id === 'tokens')!.count).toBe(1);
    expect(envelope.leftOut!.find((item) => item.id === 'pendingCalendarOps')!.count).toBe(TABLE_SPECS.pendingCalendarOps!.rows);
  });
});

describe('export -> wipe -> import is identical, in every zone', () => {
  for (const zone of ZONES) {
    for (const mode of MODES) {
      for (const seed of SEEDS) {
        it(`${zone}, ${mode} data, seed ${seed}`, async () => {
          await inZoneAsync(zone, async () => {
            const keys = primaryKeys();
            const data = buildDataset(seed, mode, keys);
            plantSecrets(data);
            remember(data);
            await seedDb(data);

            const problems: string[] = [];
            const json = JSON.stringify(await collectAll());
            for (const secret of secretStrings(data)) {
              if (json.includes(secret)) problems.push(`SECRET in the plain backup: ${secret.slice(0, 24)}...`);
            }

            const parsed = parseEnvelope(json);
            if (!parsed.ok) throw new Error(`the export did not parse: ${parsed.error}`);
            if (parsed.skipped !== 0 || parsed.snapshotsDropped !== 0) {
              problems.push(`import skipped ${parsed.skipped} rows and dropped ${parsed.snapshotsDropped} snapshots of a valid export`);
            }

            await resetDbForTesting(); // the wipe: a database with nothing of the person's in it
            await replaceAll(parsed.envelope);

            const restored = await readDb();
            const expected = expectedAfterRestoreOnAnotherDevice(data);
            for (const [table, rows] of Object.entries(expected)) {
              problems.push(...diffTable(table, keys[table]!, rows, restored[table] ?? []));
            }
            for (const table of Object.keys(LEFT_OUT)) {
              if ((restored[table] ?? []).length > 0) problems.push(`${table}: a left-out table came back with ${restored[table]!.length} rows`);
            }
            expect(problems.join('\n')).toBe('');
          });
        });
      }
    }
  }
});

describe('the oracle is not vacuous', () => {
  afterAll(() => undefined);

  it('the generated data reached every field of every table schema', () => {
    const missing: string[] = [];
    for (const [table, spec] of Object.entries(TABLE_SPECS)) {
      const rows = generated[table] ?? [];
      if (rows.length === 0) missing.push(`${table}: nothing was generated (run the whole file)`);
      for (const path of leafPaths(spec.schema, table)) {
        if (!rowsCover(rows, path)) missing.push(`${path}: no generated row had a value here`);
      }
    }
    expect(missing.join('\n')).toBe('');
  });
});

describe('secrets and the device (the rule in docs/waves/wave-18.md)', () => {
  it('a restore on the same device keeps the sign-in, the API keys and the feed URL that are already there', async () => {
    const keys = primaryKeys();
    const data = buildDataset(303, 'full', keys);
    plantSecrets(data);
    // Make every provider a browser one so each has a key on this device.
    const llm = data.llmSettings![0]! as { providers: Record<string, { credentialSource?: string }> };
    for (const entry of Object.values(llm.providers)) entry.credentialSource = 'browser';
    data.settings![0]!.icsSubscriptionUrl = SECRET.icsUrl;
    data.settings![0]!.googleCalendarConnectedAt = new Date('2026-03-04T05:06:07.089Z');
    await seedDb(data);

    const parsed = parseEnvelope(JSON.stringify(await collectAll()));
    if (!parsed.ok) throw new Error(parsed.error);
    await replaceAll(parsed.envelope); // onto the very device the backup came from

    const after = await readDb();
    expect(after.tokens).toEqual(data.tokens);
    const afterLlm = after.llmSettings![0]! as { providers: Record<string, { apiKey: string }> };
    for (const name of Object.keys(llm.providers)) expect(afterLlm.providers[name]!.apiKey).toBe(SECRET.apiKey(name));
    expect(after.settings![0]!.icsSubscriptionUrl).toBe(SECRET.icsUrl);
    expect(after.settings![0]!.googleCalendarConnectedAt).toEqual(new Date('2026-03-04T05:06:07.089Z'));
  });

  it('export does not change the database it reads', async () => {
    const keys = primaryKeys();
    const data = buildDataset(404, 'sparse', keys);
    plantSecrets(data);
    await seedDb(data);
    const before = await readDb();
    await collectAll();
    const after = await readDb();
    const problems: string[] = [];
    for (const table of tableNames()) problems.push(...diffTable(table, keys[table]!, before[table] ?? [], after[table] ?? []));
    expect(problems.join('\n')).toBe('');
    void getDb;
  });
});
