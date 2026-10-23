import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { SettingsSchema } from '@/lib/schemas/settings';
import { collectAll } from '@/lib/data-transfer/export';
import { parseEnvelope } from '@/lib/data-transfer/import';
import { PlanningSettings } from '@/components/settings/PlanningSettings';

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => cleanup());

function renderWithProviders(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function expectEveryControlNamed(scope: HTMLElement) {
  const controls = Array.from(scope.querySelectorAll<HTMLElement>('input, select, textarea'));
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    const name =
      control.getAttribute('aria-label') ??
      (control.getAttribute('aria-labelledby')
        ? document.getElementById(control.getAttribute('aria-labelledby')!)?.textContent
        : null) ??
      (control as HTMLInputElement).labels?.[0]?.textContent ??
      '';
    expect(name.trim(), `${control.tagName} ${control.id || '(no id)'} has no accessible name`).not.toBe('');
  }
}

describe('PlanningSettings', () => {
  it('renders nothing while the taskInbox flag is off', async () => {
    renderWithProviders(<PlanningSettings />);
    await waitFor(() => expect(screen.queryByText(/Planning \(preview\)/)).toBeNull());
    expect(screen.queryByLabelText('Awake from')).toBeNull();
  });

  it('shows the default waking hours and saves a change', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderWithProviders(<PlanningSettings />);

    const start = await screen.findByLabelText('Awake from');
    expect(start).toHaveValue('07:00');
    expect(screen.getByLabelText('Awake until')).toHaveValue('22:00');

    fireEvent.change(start, { target: { value: '06:30' } });
    await waitFor(async () => {
      expect((await settingsRepo.get()).wakingHours).toEqual({ start: '06:30', end: '22:00' });
    });
  });

  it('adds an anchor with named controls and a midnight note', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderWithProviders(<PlanningSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add window' }));
    const dialog = await screen.findByRole('dialog', { name: /New protected window/i });
    expect(dialog).toBeInTheDocument();
    expectEveryControlNamed(dialog);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Trading session' } });
    expect(screen.getByRole('group', { name: 'Days' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sat' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '02:00' } });
    expect(screen.getByText(/crosses midnight/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save window' }));

    await waitFor(async () => {
      const stored = await settingsRepo.get();
      expect(stored.anchors).toHaveLength(1);
      expect(stored.anchors?.[0]).toMatchObject({
        title: 'Trading session',
        start: '22:00',
        end: '02:00',
      });
      expect(stored.anchors?.[0]?.weekdays).toContain(6);
    });
  });

  it('never writes an invalid waking-hours row when the field is cleared', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderWithProviders(<PlanningSettings />);

    const start = await screen.findByLabelText('Awake from');
    fireEvent.change(start, { target: { value: '08:00' } });
    await waitFor(async () => expect((await settingsRepo.get()).wakingHours?.start).toBe('08:00'));

    // Clearing a time input fires onChange with ''. It must not be persisted.
    fireEvent.change(start, { target: { value: '' } });

    const stored = await settingsRepo.get();
    expect(stored.wakingHours).toEqual({ start: '08:00', end: '22:00' });
    expect(SettingsSchema.safeParse(stored).success).toBe(true);
  });

  it('keeps the settings row valid after every interaction', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderWithProviders(<PlanningSettings />);

    const start = await screen.findByLabelText('Awake from');
    fireEvent.change(start, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Awake until'), { target: { value: '' } });
    await waitFor(async () => expect(SettingsSchema.safeParse(await settingsRepo.get()).success).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Add window' }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Focus' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save window' }));
    await waitFor(async () => {
      const stored = await settingsRepo.get();
      expect(SettingsSchema.safeParse(stored).success).toBe(true);
      expect(stored.anchors).toHaveLength(1);
    });
  });

  it('round-trips waking hours and anchors through a backup with settings intact', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({
      wakingHours: { start: '08:00', end: '21:00' },
      anchors: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          title: 'Trading session',
          weekdays: [1, 2, 3, 4, 5],
          start: '22:00',
          end: '02:00',
          domainId: null,
        },
      ],
    });

    const envelope = await collectAll();
    const parsed = parseEnvelope(JSON.stringify(envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.settings).not.toBeNull();
    expect(parsed.envelope.settings?.wakingHours).toEqual({ start: '08:00', end: '21:00' });
    expect(parsed.envelope.settings?.anchors?.[0]?.title).toBe('Trading session');
  });

  it('shows the crosses-midnight tag in the anchor list', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({
      anchors: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          title: 'Trading session',
          weekdays: [1],
          start: '22:00',
          end: '02:00',
          domainId: null,
        },
      ],
    });
    renderWithProviders(<PlanningSettings />);
    expect(await screen.findByText(/\(crosses midnight\)/)).toBeInTheDocument();
  });

  it('refuses an anchor without a title and says why', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderWithProviders(<PlanningSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add window' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save window' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/required/i);
    expect((await settingsRepo.get()).anchors ?? []).toHaveLength(0);
  });

  it('removes an anchor through a gentle confirm', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({
      anchors: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          title: 'Trading session',
          weekdays: [1],
          start: '09:00',
          end: '11:00',
          domainId: null,
        },
      ],
    });
    renderWithProviders(<PlanningSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Trading session' }));
    const confirm = await screen.findByRole('dialog', { name: /Remove this window/i });
    expect(confirm).toHaveTextContent(/Nothing else changes/);
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }));

    await waitFor(async () => expect((await settingsRepo.get()).anchors ?? []).toHaveLength(0));
  });
});
