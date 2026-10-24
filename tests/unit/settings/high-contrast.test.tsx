import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeSettings } from '@/components/settings/ThemeSettings';
import { ThemeApplier } from '@/components/system/ThemeApplier';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { collectAll } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-contrast');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-accent');
});

beforeEach(async () => {
  await resetDbForTesting();
});

function renderWithQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return { ...view, client };
}

describe('high contrast', () => {
  it('is off unless the settings row says otherwise, and follows the row', async () => {
    const { client } = renderWithQuery(<ThemeApplier />);
    await waitFor(() => expect(document.documentElement.getAttribute('data-accent')).toBe('amber'));
    expect(document.documentElement.getAttribute('data-contrast')).toBeNull();

    await settingsRepo.patch({ highContrast: true });
    await client.refetchQueries({ queryKey: ['settings'], type: 'active' });
    await waitFor(() => expect(document.documentElement.getAttribute('data-contrast')).toBe('high'));

    await settingsRepo.patch({ highContrast: false });
    await client.refetchQueries({ queryKey: ['settings'], type: 'active' });
    await waitFor(() => expect(document.documentElement.getAttribute('data-contrast')).toBeNull());
  });

  it('is a labelled switch in the appearance settings, and it is saved', async () => {
    renderWithQuery(<ThemeSettings />);
    const toggle = (await screen.findByRole('checkbox', { name: /high contrast/i })) as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    await act(async () => {
      toggle.click();
    });
    await waitFor(async () => expect((await settingsRepo.get()).highContrast).toBe(true));
    await waitFor(() => expect(toggle.checked).toBe(true));
  });

  it('survives a backup round trip over a row written by the repository', async () => {
    await settingsRepo.patch({ highContrast: true, theme: 'light', accentColor: 'sage' });
    const envelope = await collectAll();
    const parsed = parseEnvelope(JSON.stringify(envelope));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.skipped).toBe(0);

    await resetDbForTesting();
    await replaceAll(parsed.envelope);
    const restored = await settingsRepo.get();
    expect(restored.highContrast).toBe(true);
    expect(restored.theme).toBe('light');
    expect(restored.accentColor).toBe('sage');
  });

  it('a row written before the field existed has no high contrast, and imports cleanly', async () => {
    await settingsRepo.patch({ theme: 'dark' });
    const row = await settingsRepo.get();
    const { highContrast: _removed, ...legacy } = row;
    await settingsRepo.save(legacy as typeof row);
    expect((await settingsRepo.get()).highContrast).toBeUndefined();

    const parsed = parseEnvelope(JSON.stringify(await collectAll()));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.skipped).toBe(0);
    await resetDbForTesting();
    await replaceAll(parsed.envelope);
    expect((await settingsRepo.get()).highContrast).toBeUndefined();
  });
});
