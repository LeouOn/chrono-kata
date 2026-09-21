import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetDbForTesting } from '@/lib/db/db';
import { DexieLLMSettingsRepository } from '@/lib/db/llm-settings.repo';
import { discoverLocalProviders } from '@/lib/llm/local-discovery';
import { resolveEnvironmentProviders } from '@/lib/llm/server/environment';

vi.mock('@/lib/llm/local-discovery', () => ({ discoverLocalProviders: vi.fn() }));
const desktop = { baseUrl: 'https://openrouter.ai/api/v1', model: 'test-model', apiKey: '', credentialSource: 'environment' as const };
beforeEach(async () => {
  await resetDbForTesting();
  vi.mocked(discoverLocalProviders).mockResolvedValue({ providers: { openrouter: desktop }, defaultProvider: 'openrouter' });
});

describe('Desktop environment providers', () => {
  it('reads standard keys and the Z_AI alias only on the server', () => {
    const providers = resolveEnvironmentProviders({ OPENROUTER_API_KEY: 'secret', Z_AI_API_KEY: 'z-secret', OPENROUTER_MODEL: 'custom' });
    expect(providers.openrouter?.apiKey).toBe('secret');
    expect(providers.openrouter?.model).toBe('custom');
    expect(providers.zai?.apiKey).toBe('z-secret');
    expect(resolveEnvironmentProviders({ NEXT_PUBLIC_OPENAI_API_KEY: 'not-supported' })).toEqual({});
  });
  it('automatically adds metadata without storing an environment secret', async () => {
    const settings = await new DexieLLMSettingsRepository().get();
    expect(settings.activeProviderName).toBe('openrouter');
    expect(settings.providers.openrouter).toEqual(desktop);
  });
  it('preserves manually entered configurations', async () => {
    const repo = new DexieLLMSettingsRepository();
    await repo.addProvider('openrouter', { ...desktop, credentialSource: 'browser', apiKey: 'pasted', model: 'chosen' });
    expect((await repo.get()).providers.openrouter?.apiKey).toBe('pasted');
    expect((await repo.get()).providers.openrouter?.model).toBe('chosen');
  });
  it('does not silently re-add a removed desktop provider', async () => {
    const repo = new DexieLLMSettingsRepository();
    await repo.get();
    await repo.removeProvider('openrouter');
    expect((await repo.get()).providers.openrouter).toBeUndefined();
    await repo.addProvider('openrouter', desktop);
    expect((await repo.get()).providers.openrouter).toEqual(desktop);
  });
  it('works without any desktop service on Android or a hosted app', async () => {
    vi.mocked(discoverLocalProviders).mockResolvedValue({ providers: {} });
    const settings = await new DexieLLMSettingsRepository().get();
    expect(settings.providers).toEqual({});
  });
});

it('upgrades old ZAI presets once and preserves later deliberate edits', async () => {
  const { getDb } = await import('@/lib/db/db');
  const repo = new DexieLLMSettingsRepository();
  const initial = await repo.get();
  await getDb().llmSettings.put({ ...initial, providers: { zai: { apiKey: 'pasted', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2' } }, activeProviderName: 'zai' });
  const migrated = await repo.get();
  expect(migrated.providers.zai).toMatchObject({ baseUrl: 'https://api.z.ai/api/coding/paas/v4', model: 'glm-5.3', apiKey: 'pasted' });
  expect(migrated.activeProviderName).toBe('zai');
  await repo.addProvider('zai', { ...migrated.providers.zai!, model: 'custom-model', baseUrl: 'https://custom.example/v1' });
  expect((await repo.get()).providers.zai?.model).toBe('custom-model');
  expect((await repo.get()).providers.zai?.baseUrl).toBe('https://custom.example/v1');
});
