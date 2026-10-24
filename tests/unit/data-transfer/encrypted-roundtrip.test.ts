/**
 * The wave's sentence for the ENCRYPTED file: export, wipe, import restores everything identically,
 * and with the box ticked that includes the secrets (Wave 18 part 3). Same oracle datasets as the plain
 * round trip: every table, every optional field, six time zones.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup, MIN_ITERATIONS } from '@/lib/data-transfer/encrypted';
import { collectAll, collectSecrets } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { resetDbForTesting } from '@/lib/db/db';
import { diffTable } from './oracle/compare';
import { buildDataset, type Dataset } from './oracle/dataset';
import { SECRET, ZONES, inZoneAsync, plantSecrets, primaryKeys, readDb, secretStrings, seedDb } from './oracle/harness';
import { LEFT_OUT } from './oracle/tables';

beforeEach(async () => {
  await resetDbForTesting();
});

const PASS = 'a passphrase for the test';

/** What a restore of an encrypted file gives, relative to the seeded device. */
function expectedAfterRestore(data: Dataset, withSecrets: boolean): Dataset {
  const out: Dataset = {};
  for (const [table, rows] of Object.entries(data)) {
    if (table === 'pendingCalendarOps') continue; // belongs to the device, in neither kind of file
    if (table === 'tokens' && !withSecrets) continue;
    out[table] = rows.map((row) => ({ ...row }));
  }
  const llm = out.llmSettings![0]! as { providers: Record<string, { apiKey: string; credentialSource?: string }> };
  llm.providers = Object.fromEntries(
    Object.entries(llm.providers)
      .filter(([, entry]) => entry.credentialSource !== 'environment') // found again on their own device
      .map(([name, entry]) => [name, withSecrets ? { ...entry } : { ...entry, apiKey: '' }]),
  );
  if (!withSecrets) {
    const settings = out.settings![0]!;
    if (typeof settings.icsSubscriptionUrl === 'string') delete settings.icsSubscriptionUrl;
    if (settings.googleCalendarConnectedAt != null) settings.googleCalendarConnectedAt = null;
  }
  return out;
}

for (const withSecrets of [true, false]) {
  describe(`export -> wipe -> import through an encrypted file, box ${withSecrets ? 'TICKED' : 'unticked'}`, () => {
    for (const zone of ZONES) {
      for (const mode of ['full', 'sparse'] as const) {
        it(`${zone}, ${mode} data`, async () => {
          await inZoneAsync(zone, async () => {
            const keys = primaryKeys();
            const data = buildDataset(mode === 'full' ? 301 : 302, mode, keys);
            plantSecrets(data);
            await seedDb(data);

            const envelope = await collectAll();
            const secrets = withSecrets ? await collectSecrets() : null;
            const made = await encryptBackup(envelope, PASS, { secrets, iterations: MIN_ITERATIONS });
            if (!made.ok) throw new Error(made.message);

            const problems: string[] = [];
            // The file shows nothing: no secret, and no word the person wrote.
            for (const secret of secretStrings(data)) if (made.text.includes(secret)) problems.push(`the encrypted file contains ${secret.slice(0, 24)}...`);
            const title = String(data.tasks![0]!.title);
            if (title.length > 3 && made.text.includes(title)) problems.push('the encrypted file contains a task title');

            await resetDbForTesting(); // the wipe
            const opened = await decryptBackup(made.text, PASS);
            if (!opened.ok) throw new Error(opened.message);
            expect(opened.secrets !== null).toBe(withSecrets);
            const parsed = parseEnvelope(JSON.stringify(opened.backup));
            if (!parsed.ok) throw new Error(parsed.error);
            if (parsed.skipped !== 0 || parsed.repaired !== 0) problems.push(`import skipped ${parsed.skipped} / repaired ${parsed.repaired} rows of a valid export`);
            await replaceAll(parsed.envelope, { secrets: opened.secrets });

            const restored = await readDb();
            for (const [table, rows] of Object.entries(expectedAfterRestore(data, withSecrets))) {
              problems.push(...diffTable(table, keys[table]!, rows, restored[table] ?? []));
            }
            for (const table of ['pendingCalendarOps', ...(withSecrets ? [] : ['tokens'])]) {
              if ((restored[table] ?? []).length > 0) problems.push(`${table} came back with ${restored[table]!.length} rows`);
            }
            expect(problems.join('\n')).toBe('');
          });
        });
      }
    }
  });
}

describe('the encrypted file and a device that already has credentials', () => {
  it('ticked: the file\'s keys, sign-in and calendar link win; unticked: the device\'s stay', async () => {
    const keys = primaryKeys();
    const data = buildDataset(310, 'full', keys);
    plantSecrets(data);
    data.settings![0]!.icsSubscriptionUrl = SECRET.icsUrl;
    await seedDb(data);
    const envelope = await collectAll();
    const secrets = await collectSecrets();
    const ticked = await encryptBackup(envelope, PASS, { secrets, iterations: MIN_ITERATIONS });
    const unticked = await encryptBackup(envelope, PASS, { iterations: MIN_ITERATIONS });
    if (!ticked.ok || !unticked.ok) throw new Error('encrypt failed');

    // The device meanwhile got different credentials.
    const { getDb } = await import('@/lib/db/db');
    const db = getDb();
    await db.tokens.put({ id: 'google', accessToken: 'DEVICE-ACCESS', expiresAt: new Date('2030-01-01T00:00:00.000Z') });
    const llm = (await db.llmSettings.get('singleton'))!;
    await db.llmSettings.put({ ...llm, providers: Object.fromEntries(Object.entries(llm.providers).map(([n, c]) => [n, { ...c, apiKey: `DEVICE-KEY-${n}` }])) });
    await db.settings.update('singleton', { icsSubscriptionUrl: 'https://calendar.example.org/device/feed.ics' });

    const restore = async (file: string) => {
      const opened = await decryptBackup(file, PASS);
      if (!opened.ok) throw new Error(opened.message);
      const parsed = parseEnvelope(JSON.stringify(opened.backup));
      if (!parsed.ok) throw new Error(parsed.error);
      await replaceAll(parsed.envelope, { secrets: opened.secrets });
      return readDb();
    };

    const afterUnticked = await restore(unticked.text);
    expect((afterUnticked.tokens![0] as { accessToken: string }).accessToken).toBe('DEVICE-ACCESS');
    expect(afterUnticked.settings![0]!.icsSubscriptionUrl).toBe('https://calendar.example.org/device/feed.ics');
    const keptKeys = Object.entries((afterUnticked.llmSettings![0] as { providers: Record<string, { apiKey: string }> }).providers).map(([n, c]) => [n, c.apiKey]);
    for (const [name, key] of keptKeys) expect(key, name).toBe(`DEVICE-KEY-${name}`);

    const afterTicked = await restore(ticked.text);
    expect((afterTicked.tokens![0] as { accessToken: string }).accessToken).toBe(SECRET.accessToken);
    expect(afterTicked.settings![0]!.icsSubscriptionUrl).toBe(SECRET.icsUrl);
    for (const [name, c] of Object.entries((afterTicked.llmSettings![0] as { providers: Record<string, { apiKey: string }> }).providers)) expect(c.apiKey, name).toBe(SECRET.apiKey(name));
  });
});

describe('which secrets an encrypted file may carry', () => {
  it('collects keys only for providers set up in the browser (a provider found from the environment is not a secret of the file)', async () => {
    const data = buildDataset(312, 'full', primaryKeys());
    plantSecrets(data);
    await seedDb(data);
    const { collectSecrets } = await import('@/lib/data-transfer/export');
    const secrets = await collectSecrets();
    expect(Object.keys(secrets.llmApiKeys)).toContain('planted-browser');
    expect(Object.keys(secrets.llmApiKeys)).toContain('planted-legacy');
    expect(Object.keys(secrets.llmApiKeys)).not.toContain('planted-env');
    expect(secrets.googleToken).toEqual(data.tokens![0]);
    expect(secrets.icsSubscriptionUrl).toBe(data.settings![0]!.icsSubscriptionUrl ?? null);
  });

  it('a plain export on the same device still says the secrets are left out (an encrypted file is the only way they travel)', async () => {
    const data = buildDataset(313, 'full', primaryKeys());
    plantSecrets(data);
    await seedDb(data);
    const ids = ((await collectAll()).leftOut ?? []).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['llmSettings.apiKey', 'tokens']));
  });
});

describe('a wrong passphrase changes nothing, anywhere', () => {
  it('leaves every table exactly as it was', async () => {
    const keys = primaryKeys();
    const data = buildDataset(311, 'full', keys);
    await seedDb(data);
    const made = await encryptBackup(await collectAll(), PASS, { iterations: MIN_ITERATIONS });
    if (!made.ok) throw new Error(made.message);
    const before = await readDb();
    const opened = await decryptBackup(made.text, 'not the passphrase');
    expect(opened.ok).toBe(false);
    const after = await readDb();
    for (const table of Object.keys(before)) expect(diffTable(table, keys[table]!, before[table]!, after[table]!)).toEqual([]);
    void LEFT_OUT;
  });
});
