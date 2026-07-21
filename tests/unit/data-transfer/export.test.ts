import { describe, it, expect, beforeEach } from 'vitest';
import { collectAll } from '@/lib/data-transfer/export';
import { resetDbForTesting } from '@/lib/db/db';
import { sessionRepo } from '@/lib/db/session.repo';

beforeEach(async () => {
  await resetDbForTesting();
});

describe('collectAll', () => {
  it('returns an envelope with version 1 and ISO exportedAt', async () => {
    const env = await collectAll();
    expect(env.version).toBe(1);
    expect(typeof env.exportedAt).toBe('string');
    expect(() => new Date(env.exportedAt)).not.toThrow();
  });

  it('includes all sessions', async () => {
    await sessionRepo.save({
      startedAt: new Date(),
      endedAt: null,
      durationMinutes: 30,
      reps: null,
      rating: 4,
    });
    const env = await collectAll();
    expect(env.sessions).toHaveLength(1);
  });

  it('includes settings (singleton)', async () => {
    const env = await collectAll();
    expect(env.settings).not.toBeNull();
    expect(env.settings?.id).toBe('singleton');
  });

  it('includes streak (singleton)', async () => {
    const env = await collectAll();
    expect(env.streak).not.toBeNull();
  });

  it('includes llmSettings (singleton)', async () => {
    const env = await collectAll();
    expect(env.llmSettings).not.toBeNull();
  });

  it('omits API keys from llmSettings for safe export', async () => {
    const env = await collectAll();
    // llmSettings.providers values should have apiKey stripped (safe export)
    for (const entry of Object.values(env.llmSettings?.providers ?? {})) {
      expect(entry.apiKey).toBe('');
    }
  });
});
