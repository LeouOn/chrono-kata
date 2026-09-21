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
  it('preserves a 3.5 minute duration through JSON parse and restore', async () => {
    const envelope: ExportEnvelope = {
      ...validEnvelope,
      sessions: [
        {
          ...validEnvelope.sessions[0]!,
          durationMinutes: 3.5,
          reps: null,
          activityLabel: 'Daily stretches',
        },
      ],
    };
    const parsed = parseEnvelope(JSON.stringify(envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.sessions[0]!.durationMinutes).toBe(3.5);

    await replaceAll(parsed.envelope);
    const all = await sessionRepo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.durationMinutes).toBe(3.5);
  });

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

  it('skips invalid session rows instead of importing them', () => {
    const base = validEnvelope.sessions[0]!;
    const envelope = {
      ...validEnvelope,
      sessions: [
        base,
        { ...base, id: 'not-a-uuid' },
        { ...base, startedAt: 'not-a-date' },
        { ...base, rating: 99 },
      ],
    };
    const result = parseEnvelope(JSON.stringify(envelope));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(3);
    expect(result.envelope.sessions).toHaveLength(1);
    expect(result.envelope.sessions[0]?.id).toBe(base.id);
  });

  it('rejects files where an optional collection is malformed', () => {
    const kata = parseEnvelope(JSON.stringify({ ...validEnvelope, kataTemplates: 'nope' }));
    expect(kata.ok).toBe(false);

    const conv = parseEnvelope(JSON.stringify({ ...validEnvelope, conversations: 42 }));
    expect(conv.ok).toBe(false);

    const refl = parseEnvelope(JSON.stringify({ ...validEnvelope, reflections: {} }));
    expect(refl.ok).toBe(false);
  });

  it('skips duplicate ids instead of failing the whole restore', () => {
    const base = validEnvelope.sessions[0]!;
    const result = parseEnvelope(
      JSON.stringify({ ...validEnvelope, sessions: [base, { ...base }] })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(1);
    expect(result.envelope.sessions).toHaveLength(1);
  });

  it('rolls back the wipe when a restore step fails', async () => {
    await sessionRepo.save({
      startedAt: new Date(),
      durationMinutes: 12,
      reps: null,
      rating: 3,
    });
    expect(await sessionRepo.getAll()).toHaveLength(1);

    const envelope: ExportEnvelope = {
      ...validEnvelope,
      sessions: [...validEnvelope.sessions],
    };
    // Sabotage one row post-parse so bulkAdd violates the primary key mid-restore.
    const parsed = parseEnvelope(JSON.stringify(envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    parsed.envelope.sessions.push({ ...parsed.envelope.sessions[0]! });

    await expect(replaceAll(parsed.envelope)).rejects.toThrow();
    const after = await sessionRepo.getAll();
    expect(after).toHaveLength(1);
    expect(after[0]?.durationMinutes).toBe(12);
  });

  it('restores kata templates from the file', async () => {
    const { kataTemplateRepo } = await import('@/lib/db/kata-template.repo');
    const envelope: ExportEnvelope = {
      ...validEnvelope,
      kataTemplates: [
        {
          id: crypto.randomUUID(),
          name: 'Mobility',
          mode: 'reps',
          defaultDurationMinutes: null,
          defaultReps: 8,
          icon: '🧘',
          order: 0,
          createdAt: new Date('2026-09-01T10:00:00Z'),
          updatedAt: new Date('2026-09-01T10:00:00Z'),
        },
      ],
    };
    const parsed = parseEnvelope(JSON.stringify(envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await replaceAll(parsed.envelope);
    const all = await kataTemplateRepo.getAll();
    expect(all.some((t) => t.name === 'Mobility')).toBe(true);
  });

  it('preserves local kata templates when importing a legacy file without them', async () => {
    const { kataTemplateRepo } = await import('@/lib/db/kata-template.repo');
    await kataTemplateRepo.create({ name: 'Local Only', mode: 'timed', defaultDurationMinutes: 10 });

    await replaceAll(validEnvelope);

    const all = await kataTemplateRepo.getAll();
    expect(all.some((t) => t.name === 'Local Only')).toBe(true);
  });

  it('wipes and restores coach threads when the file carries them', async () => {
    const sessionId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const envelope: ExportEnvelope = {
      ...validEnvelope,
      conversations: [
        {
          id: conversationId,
          sessionId,
          rootMessageId: null,
          activeLeafId: null,
          createdAt: new Date('2026-09-01T10:00:00Z'),
          updatedAt: new Date('2026-09-01T10:00:00Z'),
        },
      ],
      messages: [
        {
          id: crypto.randomUUID(),
          conversationId,
          parentId: null,
          role: 'user',
          content: 'thread body',
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
      ],
    };
    const parsed = parseEnvelope(JSON.stringify(envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toBe(0);

    await replaceAll(parsed.envelope);
    const { getDb } = await import('@/lib/db/db');
    expect(await getDb().conversations.toArray()).toHaveLength(1);
    expect(await getDb().messages.toArray()).toHaveLength(1);
  });

  it('restores habits and rebuilds session-derived logs exactly once', async () => {
    const { getDb } = await import('@/lib/db/db');
    const habit = {
      id: crypto.randomUUID(),
      name: 'Stretching',
      icon: '🤸',
      kind: 'timed' as const,
      targetPerDay: 3.5,
      schedule: { kind: 'daily' as const },
      linkedActivityLabel: 'Daily stretches',
      order: 0,
      archivedAt: null,
      createdAt: new Date('2026-09-01T10:00:00Z'),
      updatedAt: new Date('2026-09-01T10:00:00Z'),
    };
    const session = {
      ...validEnvelope.sessions[0]!,
      activityLabel: 'Daily stretches',
      durationMinutes: 3.5,
      startedAt: new Date('2026-09-21T10:00:00Z'),
    };
    const envelope: ExportEnvelope = {
      ...validEnvelope,
      sessions: [session],
      habits: [habit],
      habitLogs: [
        {
          id: crypto.randomUUID(),
          habitId: habit.id,
          date: '2026-09-21',
          minutes: 3.5,
          delta: null,
          source: 'session' as const,
          sessionId: session.id,
          createdAt: new Date('2026-09-21T10:00:00Z'),
        },
      ],
    };
    const parsed = parseEnvelope(JSON.stringify(envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await replaceAll(parsed.envelope);

    expect(await getDb().habits.toArray()).toHaveLength(1);
    const logs = await getDb().habitLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.minutes).toBe(3.5);
    expect(logs[0]?.sessionId).toBe(session.id);
  });

  it('preserves local habits when importing a legacy file without them', async () => {
    const { habitRepo } = await import('@/lib/db/habit.repo');
    const { getDb } = await import('@/lib/db/db');
    await habitRepo.create({
      name: 'Local Only',
      kind: 'boolean',
      targetPerDay: null,
      schedule: { kind: 'daily' },
    });
    await habitRepo.create({
      name: 'Linked',
      kind: 'timed',
      targetPerDay: 3.5,
      schedule: { kind: 'daily' },
      linkedActivityLabel: 'chrono-kata session',
    });

    const envelope: ExportEnvelope = {
      ...validEnvelope,
      sessions: [
        {
          ...validEnvelope.sessions[0]!,
          startedAt: new Date('2026-09-21T10:00:00Z'),
          activityLabel: 'chrono-kata session',
        },
      ],
    };
    const parsed = parseEnvelope(JSON.stringify(envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await replaceAll(parsed.envelope);

    const habits = await getDb().habits.toArray();
    expect(habits.map((h) => h.name).sort()).toEqual(['Linked', 'Local Only']);
    const logs = await getDb().habitLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.source).toBe('session');
  });
});
