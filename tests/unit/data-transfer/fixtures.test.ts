import { describe, it, expect, beforeEach } from 'vitest';
import envelopeJson from '../../fixtures/backup-envelope-v2.json';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { migrateEnvelope } from '@/lib/data-transfer/migrate';
import { resetDbForTesting, getDb } from '@/lib/db/db';

/**
 * The synthetic fixtures in `tests/fixtures/` exist so future migration work
 * has stable data to load. These tests keep them honest: an additive schema
 * change must leave them valid, and a breaking one must come with a migration
 * (and a new fixture), not a silent edit here.
 */

const envelope = envelopeJson as unknown as Record<string, unknown>;

beforeEach(async () => {
  await resetDbForTesting();
});

describe('backup-envelope-v2.json', () => {
  it('is already at the current envelope version', () => {
    const migrated = migrateEnvelope({ ...envelope });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.raw.version).toBe(2);
  });

  it('parses through parseEnvelope with no skipped rows', () => {
    const result = parseEnvelope(JSON.stringify(envelope));
    expect(result.ok, result.ok ? '' : result.error).toBe(true);
    if (!result.ok) return;

    expect(result.skipped).toBe(0);
    expect(result.envelope.sessions).toHaveLength(3);
    expect(result.envelope.reflections).toHaveLength(1);
    expect(result.envelope.kataTemplates).toHaveLength(3);
    expect(result.envelope.conversations).toHaveLength(1);
    expect(result.envelope.messages).toHaveLength(3);
    expect(result.envelope.habits).toHaveLength(3);
    expect(result.envelope.habitLogs).toHaveLength(3);
    expect(result.envelope.checkIns).toHaveLength(3);
    expect(result.envelope.streak?.currentStreakDays).toBe(4);
    expect(result.envelope.settings?.recoveryMode).toBe(true);
    expect(result.envelope.llmSettings?.activeProviderName).toBe('openai');
  });

  it('restores into an empty database through replaceAll', async () => {
    const result = parseEnvelope(JSON.stringify(envelope));
    if (!result.ok) throw new Error(result.error);

    await replaceAll(result.envelope);

    const db = getDb();
    expect(await db.sessions.count()).toBe(3);
    expect(await db.reflections.count()).toBe(1);
    expect(await db.kataTemplates.count()).toBe(3);
    expect(await db.conversations.count()).toBe(1);
    expect(await db.messages.count()).toBe(3);
    expect(await db.habits.count()).toBe(3);
    expect(await db.habitLogs.count()).toBe(3);
    expect(await db.checkIns.count()).toBe(3);

    // Representative links survive: session → kata template, habit → kata
    // template, habit log → session, session → conversation.
    const session = await db.sessions.get('96d32341-1143-4be2-9ce2-e9c495abcc12');
    expect(session?.kataTemplateId).toBe('b7a04fe2-0b66-4d86-b40c-afa2b45af613');
    expect(session?.conversationId).toBe('4dda19bd-8773-4053-bf79-37196f0f0868');

    const habit = await db.habits.get('c0dca0e9-d048-4f8e-92b5-116ec0d64eac');
    expect(habit?.linkedKataTemplateId).toBe('b7a04fe2-0b66-4d86-b40c-afa2b45af613');

    // Session-sourced habit logs are rebuilt from sessions by replaceAll, so
    // their ids are new; the link to the session is what must survive. Query by
    // habit rather than by date: the fixture timestamps are UTC, so the derived
    // local day key depends on the machine's timezone.
    const sessionLogs = (
      await db.habitLogs.where('habitId').equals('c0dca0e9-d048-4f8e-92b5-116ec0d64eac').toArray()
    ).filter((log) => log.source === 'session');
    expect(sessionLogs).toHaveLength(1);
    expect(sessionLogs[0]?.sessionId).toBe('96d32341-1143-4be2-9ce2-e9c495abcc12');
    expect(sessionLogs[0]?.minutes).toBe(20);

    // Dates arrive as Dates, not strings, so repos and date helpers work.
    expect(session?.startedAt).toBeInstanceOf(Date);
    expect((await db.checkIns.get('2026-10-20'))?.createdAt).toBeInstanceOf(Date);
  });
});
