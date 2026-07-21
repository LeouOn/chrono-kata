import { describe, it, expect, beforeEach } from 'vitest';
import { replaceAll, parseEnvelope } from '@/lib/data-transfer/import';
import { resetDbForTesting } from '@/lib/db/db';
import { sessionRepo } from '@/lib/db/session.repo';
import type { ExportEnvelope } from '@/lib/data-transfer/types';

beforeEach(async () => {
  await resetDbForTesting();
});

const validEnvelope: ExportEnvelope = {
  version: 1,
  exportedAt: '2026-07-21T12:00:00.000Z',
  sessions: [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      startedAt: new Date('2026-07-21T10:00:00Z'),
      durationMinutes: 30,
      reps: null,
      rating: 4,
      createdAt: new Date('2026-07-21T10:00:00Z'),
      updatedAt: new Date('2026-07-21T10:00:00Z'),
    },
  ],
  reflections: [],
  streak: null,
  settings: null,
  llmSettings: null,
};

describe('parseEnvelope', () => {
  it('parses valid JSON', () => {
    const result = parseEnvelope(JSON.stringify(validEnvelope));
    expect(result.ok).toBe(true);
  });

  it('rejects invalid JSON', () => {
    const result = parseEnvelope('not json');
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported version', () => {
    const result = parseEnvelope(JSON.stringify({ ...validEnvelope, version: 2 }));
    expect(result.ok).toBe(false);
  });

  it('rejects missing version field', () => {
    const result = parseEnvelope(JSON.stringify({ sessions: [] }));
    expect(result.ok).toBe(false);
  });
});

describe('replaceAll', () => {
  it('wipes existing data and restores from envelope', async () => {
    // Seed with existing data
    await sessionRepo.save({
      startedAt: new Date(),
      durationMinutes: 99,
      reps: null,
      rating: 1,
    });
    expect(await sessionRepo.getAll()).toHaveLength(1);

    await replaceAll(validEnvelope);

    const all = await sessionRepo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.durationMinutes).toBe(30);
  });

  it('preserves existing API keys when imported providers have empty keys', async () => {
    // Set up existing llmSettings with an API key
    const { llmSettingsRepo } = await import('@/lib/db/llm-settings.repo');
    await llmSettingsRepo.addProvider('openai', {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-existing',
      model: 'gpt-4o',
    });

    // Import envelope with empty apiKey
    const envelopeWithLLM: ExportEnvelope = {
      ...validEnvelope,
      llmSettings: {
        id: 'singleton',
        activeProviderName: 'openai',
        providers: {
          openai: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o' },
        },
        totalTokensThisMonth: 0,
        totalTokensResetAt: new Date('2026-08-01'),
        updatedAt: new Date(),
      },
    };
    await replaceAll(envelopeWithLLM);

    const after = await llmSettingsRepo.get();
    expect(after.providers.openai?.apiKey).toBe('sk-existing');
  });
});
