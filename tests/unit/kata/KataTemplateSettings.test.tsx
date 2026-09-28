import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KataTemplateSettings } from '@/components/settings/KataTemplateSettings';
import { kataTemplateRepo } from '@/lib/db/kata-template.repo';
import { resetDbForTesting } from '@/lib/db/db';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

beforeEach(async () => {
  await resetDbForTesting();
  localStorage.clear();
});

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <KataTemplateSettings />
    </QueryClientProvider>
  );
}

async function openCreateModal() {
  fireEvent.click(screen.getByRole('button', { name: /add kata/i }));
  await screen.findByText('New Kata Preset');
}

function fillName(name: string) {
  fireEvent.change(screen.getByPlaceholderText('e.g. Morning Zazen'), { target: { value: name } });
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save Kata' }));
}

function onlyEditButton(): HTMLButtonElement {
  for (const button of screen.getAllByTitle('Edit kata')) {
    if (button instanceof HTMLButtonElement) return button;
  }
  throw new Error('expected exactly one edit button');
}

function expectPressed(name: string, pressed: boolean) {
  expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', String(pressed));
}

describe('KataTemplateSettings intensity selector', () => {
  it('defaults new katas to moderate and persists it', async () => {
    renderSettings();
    await openCreateModal();
    fillName('Defaults Kata');
    expectPressed('Moderate', true);
    expectPressed('Gentle', false);
    expectPressed('Hard', false);
    save();
    await waitFor(async () => {
      const created = (await kataTemplateRepo.getAll()).find((t) => t.name === 'Defaults Kata');
      expect(created?.intensity).toBe(2);
    });
  });

  it('persists a changed Gentle selection for a new kata', async () => {
    renderSettings();
    await openCreateModal();
    fillName('Gentle Kata');
    fireEvent.click(screen.getByRole('button', { name: 'Gentle' }));
    save();
    await waitFor(async () => {
      const created = (await kataTemplateRepo.getAll()).find((t) => t.name === 'Gentle Kata');
      expect(created?.intensity).toBe(1);
    });
  });

  it('shows the stored intensity when editing an existing kata', async () => {
    await kataTemplateRepo.create({
      name: 'Zazen Max',
      mode: 'timed',
      defaultDurationMinutes: 10,
      icon: '🥋',
      intensity: 3,
    });
    renderSettings();
    await screen.findByText('Zazen Max');
    fireEvent.click(onlyEditButton());
    await screen.findByText('Edit Kata Preset');
    expectPressed('Hard', true);
    expectPressed('Moderate', false);
    expectPressed('Gentle', false);
  });

  it('shows Gentle when editing a kata with no stored intensity', async () => {
    await kataTemplateRepo.create({
      name: 'Legacy Kata',
      mode: 'timed',
      defaultDurationMinutes: 10,
      icon: '🥋',
    });
    renderSettings();
    await screen.findByText('Legacy Kata');
    fireEvent.click(onlyEditButton());
    await screen.findByText('Edit Kata Preset');
    expectPressed('Gentle', true);
  });

  it('persists an intensity change made while editing', async () => {
    await kataTemplateRepo.create({
      name: 'Edit Me',
      mode: 'timed',
      defaultDurationMinutes: 10,
      icon: '🥋',
      intensity: 1,
    });
    renderSettings();
    await screen.findByText('Edit Me');
    fireEvent.click(onlyEditButton());
    await screen.findByText('Edit Kata Preset');
    fireEvent.click(screen.getByRole('button', { name: 'Hard' }));
    save();
    await waitFor(async () => {
      const updated = (await kataTemplateRepo.getAll()).find((t) => t.name === 'Edit Me');
      expect(updated?.intensity).toBe(3);
    });
  });
});
