/** Shared plumbing for the completeness oracle: zones, seeding, reading back, planted secrets. */
import { getDb } from '@/lib/db/db';
import type { Dataset } from './dataset';
import type { Row } from './tables';

export const ZONES = [
  'UTC',
  'Europe/Helsinki',
  'America/Los_Angeles',
  'Pacific/Kiritimati',
  'Pacific/Auckland',
  'Asia/Kolkata',
] as const;

/** Run `body` with the process clock in `zone`; always restores the previous zone. */
export async function inZoneAsync<T>(zone: string, body: () => Promise<T>): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

/** table name -> primary key field, read from Dexie itself. */
export function primaryKeys(): Record<string, string> {
  return Object.fromEntries(
    getDb().tables.map((t) => {
      const keyPath = t.schema.primKey.keyPath;
      if (typeof keyPath !== 'string') throw new Error(`oracle: ${t.name} has a compound or missing primary key`);
      return [t.name, keyPath];
    }),
  );
}

export function tableNames(): string[] {
  return getDb().tables.map((t) => t.name).sort();
}

/** Write a dataset straight into Dexie (not through the repos, which would stamp their own times). */
export async function seedDb(data: Dataset): Promise<void> {
  const db = getDb();
  await db.domains.clear(); // a fresh database already holds the four default domains
  for (const [table, rows] of Object.entries(data)) {
    await db.table(table).bulkPut(rows);
  }
}

export async function readDb(): Promise<Dataset> {
  const out: Dataset = {};
  for (const t of getDb().tables) out[t.name] = (await t.toArray()) as Row[];
  return out;
}

export const SECRET = {
  accessToken: 'SECRET-ACCESS-TOKEN-0f3a',
  refreshToken: 'SECRET-REFRESH-TOKEN-91bc',
  apiKey: (name: string) => `SECRET-API-KEY-${name}`,
  icsUrl: 'https://calendar.example.org/ical/SECRET-ICS-TOKEN-77de/basic.ics',
};

/**
 * Put recognisable secrets where the app keeps them, so a leak is found by searching the exported file
 * for these strings. Everything else in the row stays as generated.
 */
export function plantSecrets(data: Dataset): void {
  const token = data.tokens![0]!;
  token.accessToken = SECRET.accessToken;
  if (token.refreshToken !== undefined) token.refreshToken = SECRET.refreshToken;
  // Whatever providers were generated, make sure each kind that matters is present: one set up in the
  // browser, one saved by an older build (no credentialSource), one found from the device's environment.
  const llm = data.llmSettings![0]! as { providers: Record<string, { apiKey: string; credentialSource?: string }> };
  const template = Object.values(llm.providers)[0]!;
  for (const [name, source] of [['planted-browser', 'browser'], ['planted-legacy', undefined], ['planted-env', 'environment']] as const) {
    const entry = { ...template, credentialSource: source };
    if (source === undefined) delete entry.credentialSource;
    llm.providers[name] = entry;
  }
  for (const [name, entry] of Object.entries(llm.providers)) entry.apiKey = SECRET.apiKey(name);
  const settings = data.settings![0]!;
  if (settings.icsSubscriptionUrl != null) settings.icsSubscriptionUrl = SECRET.icsUrl;
}

export function secretStrings(data: Dataset): string[] {
  const out: string[] = [];
  const token = data.tokens![0]!;
  out.push(String(token.accessToken));
  if (token.refreshToken != null) out.push(String(token.refreshToken));
  const llm = data.llmSettings![0]! as { providers: Record<string, { apiKey: string }> };
  for (const entry of Object.values(llm.providers)) if (entry.apiKey) out.push(entry.apiKey);
  const ics = data.settings![0]!.icsSubscriptionUrl;
  if (typeof ics === 'string') out.push(ics);
  return out;
}

const COLLECTION_KEYS = [
  'sessions', 'reflections', 'kataTemplates', 'conversations', 'messages', 'habits', 'habitLogs', 'checkIns',
  'domains', 'projects', 'tasks', 'blocks', 'dayPlans', 'estimates', 'reviews', 'reviewDrafts',
];

/**
 * A dataset as the TEXT of a backup file, built by hand (not by `collectAll`): the three single-row records
 * unwrapped, the collections as arrays, dates as ISO text. For tests that damage a file on purpose.
 */
export function backupTextOf(data: Dataset, tweak: (file: Record<string, unknown>) => void = () => undefined): string {
  const file: Record<string, unknown> = {
    version: 2,
    exportedAt: '2026-10-24T12:00:00.000Z',
    streak: data.streak![0],
    settings: data.settings![0],
    llmSettings: data.llmSettings![0],
  };
  for (const key of COLLECTION_KEYS) file[key] = data[key];
  const copy = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
  tweak(copy);
  return JSON.stringify(copy);
}


/**
 * What a restore of a PLAIN backup gives, relative to the seeded device: the secrets rule applied. Used by
 * the tests that make a copy and put it back. (Environment providers and waiting calendar updates are in
 * neither kind of backup; the API keys, sign-in and calendar link are only in an encrypted one.)
 */
export function expectedAfterPlainRestore(data: Dataset): Dataset {
  const out: Dataset = {};
  for (const [table, rows] of Object.entries(data)) {
    if (table === 'pendingCalendarOps' || table === 'tokens') continue;
    out[table] = rows.map((row) => ({ ...row }));
  }
  const llm = out.llmSettings![0]! as { providers: Record<string, { apiKey: string; credentialSource?: string }> };
  llm.providers = Object.fromEntries(
    Object.entries(llm.providers)
      .filter(([, entry]) => entry.credentialSource !== 'environment')
      .map(([name, entry]) => [name, { ...entry, apiKey: '' }]),
  );
  const settings = out.settings![0]!;
  if (typeof settings.icsSubscriptionUrl === 'string') delete settings.icsSubscriptionUrl;
  if (settings.googleCalendarConnectedAt != null) settings.googleCalendarConnectedAt = null;
  return out;
}
