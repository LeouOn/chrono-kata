import { describe, it, expect, beforeEach } from 'vitest';
import { collectAll } from '@/lib/data-transfer/export';
import { resetDbForTesting } from '@/lib/db/db';
import { sessionRepo } from '@/lib/db/session.repo';

beforeEach(async () => {
  await resetDbForTesting();
});

describe('collectAll', () => {
  it('returns an envelope with version 2 and ISO exportedAt', async () => {
    const env = await collectAll();
    expect(env.version).toBe(2);
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

  it('keeps a 3.5 minute duration through export JSON', async () => {
    await sessionRepo.save({
      startedAt: new Date('2026-09-21T12:00:00Z'),
      endedAt: new Date('2026-09-21T12:03:30Z'),
      durationMinutes: 3.5,
      reps: null,
      rating: 4,
      activityLabel: 'Daily stretches',
    });
    const env = await collectAll();
    expect(env.sessions[0]?.durationMinutes).toBe(3.5);
    const roundTripped = JSON.parse(JSON.stringify(env)) as {
      sessions: { durationMinutes: number }[];
    };
    expect(roundTripped.sessions[0]?.durationMinutes).toBe(3.5);
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

  it('includes kata templates', async () => {
    const { kataTemplateRepo } = await import('@/lib/db/kata-template.repo');
    await kataTemplateRepo.create({ name: 'Mobility', mode: 'reps', defaultReps: 8 });
    const env = await collectAll();
    expect(env.kataTemplates?.some((t) => t.name === 'Mobility')).toBe(true);
  });

  it('includes coach threads (conversations and messages)', async () => {
    const { conversationRepo } = await import('@/lib/db/conversation.repo');
    const { messageRepo } = await import('@/lib/db/message.repo');
    const session = await sessionRepo.save({
      startedAt: new Date(),
      durationMinutes: 15,
      reps: null,
      rating: 4,
    });
    const conversation = await conversationRepo.save({ sessionId: session.id });
    await messageRepo.save({
      conversationId: conversation.id,
      parentId: null,
      role: 'user',
      content: 'hello',
    });
    const env = await collectAll();
    expect(
      env.conversations?.some((c) => c.sessionId === session.id)
    ).toBe(true);
    expect(env.messages).toHaveLength(1);
  });

  it('includes habits and habit logs', async () => {
    const { habitRepo } = await import('@/lib/db/habit.repo');
    const { habitLogRepo } = await import('@/lib/db/habit-log.repo');
    const habit = await habitRepo.create({
      name: 'Water plants',
      kind: 'boolean',
      targetPerDay: null,
      schedule: { kind: 'daily' },
    });
    await habitLogRepo.add({ habitId: habit.id, date: '2026-09-21', minutes: null, delta: null, source: 'manual' });

    const env = await collectAll();
    expect(env.habits?.some((h) => h.name === 'Water plants')).toBe(true);
    expect(env.habitLogs).toHaveLength(1);
  });
});

it('omits desktop environment connections from portable backups', async () => {
  const { llmSettingsRepo } = await import('@/lib/db/llm-settings.repo');
  await llmSettingsRepo.addProvider('deepseek', { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: '', credentialSource: 'environment' });
  const envelope = await collectAll();
  expect(envelope.llmSettings?.providers.deepseek).toBeUndefined();
});
