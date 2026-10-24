import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReviewSummary } from '@/components/review/ReviewSummary';
import { resetDbForTesting } from '@/lib/db/db';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import type { Session } from '@/lib/schemas/session';

const generate = vi.fn();
// Keep the rest of the module (resolveProviderFor is what the disclosure panel
// uses); only the generation call is replaced.
vi.mock('@/lib/llm/llm-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/llm-service')>();
  return { ...actual, generateWeeklyReflection: (...args: unknown[]) => generate(...args) };
});

const startedAt = new Date('2026-06-16T09:00:00');
const SESSIONS: Session[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    startedAt,
    endedAt: new Date('2026-06-16T09:30:00'),
    durationMinutes: 30,
    reps: null,
    rating: 4,
    activityLabel: 'Trading journal',
    note: 'a private note that must not be sent',
    createdAt: startedAt,
    updatedAt: startedAt,
  } as Session,
];

function renderSummary(notes = 'My own words.', onNotesChange = vi.fn()) {
  render(<ReviewSummary sessions={SESSIONS} notes={notes} onNotesChange={onNotesChange} />);
  return { onNotesChange };
}

async function openAndWaitForProvider() {
  fireEvent.click(screen.getByRole('button', { name: 'Get a summary' }));
  await screen.findByText(/Exactly what leaves the device/);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Send to local$/ })).toBeEnabled());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(async () => {
  await resetDbForTesting();
  await llmSettingsRepo.addProvider('local', {
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'small-model',
    apiKey: '',
  });
  await llmSettingsRepo.setActive('local');
});

describe('ReviewSummary', () => {
  it('shows the exact wire text and sends nothing until the user presses Send', async () => {
    renderSummary();
    await openAndWaitForProvider();

    const wire = screen.getByText(/Total sessions: 1/);
    expect(wire.textContent).toContain('Trading journal');
    expect(wire.textContent).not.toContain('a private note');
    expect(screen.getByText(/Goes to local \(small-model\) — on this device\./)).toBeTruthy();
    expect(generate).not.toHaveBeenCalled();
  });

  it('sends once, then adds the result only when the user asks for it', async () => {
    generate.mockResolvedValue({
      observations: ['Trading got the week.', 'Practice stalled once.'],
      question: 'What would make practice easy to start?',
      promptTokens: 10,
      completionTokens: 5,
    });
    const { onNotesChange } = renderSummary();
    await openAndWaitForProvider();

    fireEvent.click(screen.getByRole('button', { name: /^Send to local$/ }));
    expect(await screen.findByText('Trading got the week.')).toBeTruthy();
    expect(screen.getByText(/Question to sit with:/)).toBeTruthy();
    expect(generate).toHaveBeenCalledTimes(1);
    const call = generate.mock.calls[0]![0] as { sessions: Session[] };
    expect(call.sessions[0]?.note).toBeUndefined();
    // Generated, shown — and not written anywhere.
    expect(onNotesChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add to my notes' }));
    expect(onNotesChange).toHaveBeenCalledTimes(1);
    const merged = onNotesChange.mock.calls[0]![0] as string;
    expect(merged.startsWith('My own words.')).toBe(true);
    expect(merged).toContain('From the weekly summary:');
    expect(merged).toContain('- Trading got the week.');
  });

  it('keeps Send disabled and explains private mode when the provider may not be used', async () => {
    await settingsRepo.patch({ flags: { privateMode: true } });
    await llmSettingsRepo.addProvider('remote', {
      baseUrl: 'https://api.example.com/v1',
      model: 'big-model',
      apiKey: 'sk-test',
    });
    await llmSettingsRepo.setActive('remote');

    renderSummary();
    fireEvent.click(screen.getByRole('button', { name: 'Get a summary' }));
    await screen.findByText(/Exactly what leaves the device/);

    // The provider message also starts with "Private mode is on", so match the
    // hint that explains what is allowed rather than the shared prefix.
    expect(await screen.findByText(/only a provider on this device/)).toBeTruthy();
    const send = screen.getByRole('button', { name: /^Send to provider$/ }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });

  it('a failed summary says nothing was added and can be retried', async () => {
    generate.mockRejectedValueOnce(new Error('provider is down'));
    const { onNotesChange } = renderSummary();
    await openAndWaitForProvider();

    fireEvent.click(screen.getByRole('button', { name: /^Send to local$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nothing was added');
    expect(onNotesChange).not.toHaveBeenCalled();

    generate.mockResolvedValueOnce({ observations: ['Second time works.'], question: '', promptTokens: 1, completionTokens: 1 });
    fireEvent.click(screen.getByRole('button', { name: /^Send to local$/ }));
    expect(await screen.findByText('Second time works.')).toBeTruthy();
  });

  it('says there is nothing to summarise when the week has no sessions', async () => {
    const onNotesChange = vi.fn();
    render(<ReviewSummary sessions={[]} notes="" onNotesChange={onNotesChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Get a summary' }));
    expect(await screen.findByText(/No sessions this week/)).toBeTruthy();
    expect(generate).not.toHaveBeenCalled();
  });
});
