import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { kataTemplateRepo } from '@/lib/db/kata-template.repo';
import { HabitSettings } from '@/components/settings/HabitSettings';
import { KataTemplateSettings } from '@/components/settings/KataTemplateSettings';

beforeEach(async () => {
  await resetDbForTesting();
  // Seed one kata so the habit "link to sessions" select has an option.
  await kataTemplateRepo.seedDefaultsIfEmpty();
});

afterEach(() => cleanup());

function renderWithProviders(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

/** Every input/select/textarea in the dialog must have an accessible name. */
function expectEveryControlNamed(container: HTMLElement) {
  const dialog = container.querySelector('[role="dialog"]') ?? container;
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>('input, select, textarea'));
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

describe('HabitSettings dialog accessible names', () => {
  it('names every control in timed mode', async () => {
    const { container } = renderWithProviders(<HabitSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /add habit/i }));
    await screen.findByRole('dialog', { name: /new habit/i });

    expect(screen.getByLabelText('Icon')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    // Default kind is Yes/No; switch to timed to expose the minutes target.
    fireEvent.click(screen.getByRole('button', { name: /Timed/i }));
    expect(screen.getByLabelText('Daily target (minutes)')).toBeInTheDocument();
    expect(screen.getByLabelText('Link to sessions (optional)')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Kind' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Schedule' })).toBeInTheDocument();
    expectEveryControlNamed(container);
  });

  it('names the unit and target in count mode', async () => {
    renderWithProviders(<HabitSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /add habit/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Count/ }));

    expect(screen.getByLabelText('Daily target (units)')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit')).toBeInTheDocument();
  });

  it('names the custom activity label when a custom session link is chosen', async () => {
    const { container } = renderWithProviders(<HabitSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /add habit/i }));

    fireEvent.change(await screen.findByLabelText('Link to sessions (optional)'), {
      target: { value: 'custom' },
    });
    expect(await screen.findByLabelText('Custom activity label')).toBeInTheDocument();
    expectEveryControlNamed(container);
  });
});

describe('KataTemplateSettings dialog accessible names', () => {
  it('names every control in timed mode', async () => {
    const { container } = renderWithProviders(<KataTemplateSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /add kata/i }));
    await screen.findByRole('dialog', { name: /new kata preset/i });

    expect(screen.getByLabelText('Routine Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Default Duration (minutes)')).toBeInTheDocument();
    expect(screen.getByLabelText('Soft cap (minutes, optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Activity Label (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Default Note (optional)')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Icon' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Intensity' })).toBeInTheDocument();
    expectEveryControlNamed(container);

    // The dialog still writes to the template repository.
    fireEvent.change(screen.getByLabelText('Routine Name'), { target: { value: 'Evening Sit' } });
    fireEvent.change(screen.getByLabelText('Default Duration (minutes)'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /save kata/i }));
    await waitFor(async () => {
      const templates = await getDb().kataTemplates.toArray();
      expect(templates.some((template) => template.name === 'Evening Sit')).toBe(true);
    });
  });

  it('names the repetitions field in reps mode', async () => {
    renderWithProviders(<KataTemplateSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /add kata/i }));
    fireEvent.click(await screen.findByRole('button', { name: /reps/i }));

    expect(screen.getByLabelText('Default Repetitions')).toBeInTheDocument();
    expect(screen.queryByLabelText('Default Duration (minutes)')).toBeNull();
  });
});
