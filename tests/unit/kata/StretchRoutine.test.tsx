import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StretchRoutine } from '@/components/kata/StretchRoutine';
import { playIntervalPing } from '@/lib/audio/bell-synthesizer';
import type { SessionInput } from '@/lib/schemas/session';

vi.mock('@/lib/audio/bell-synthesizer', () => ({
  playIntervalPing: vi.fn(),
}));

const FIGURE_FOUR_NAMES = [
  'Pancake',
  'Figure four · Left',
  'Figure four · Right',
  'Stable forward lunge with a gentle backward arch · Left',
  'Stable forward lunge with a gentle backward arch · Right',
  'Bar/strap chest opener',
  'Lat stretch',
];

const HALF_PIGEON_NAMES = [
  'Pancake',
  'Half pigeon · Left',
  'Half pigeon · Right',
  'Stable forward lunge with a gentle backward arch · Left',
  'Stable forward lunge with a gentle backward arch · Right',
  'Bar/strap chest opener',
  'Lat stretch',
];

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['Date', 'setInterval', 'clearInterval'],
    now: new Date('2026-09-21T12:00:00Z').getTime(),
  });
  vi.mocked(playIntervalPing).mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderRoutine(onSave: (input: SessionInput) => Promise<unknown> = async () => undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StretchRoutine onSave={onSave} />
    </QueryClientProvider>,
  );
}

function openRoutine() {
  renderRoutine();
  fireEvent.click(screen.getByRole('button', { name: /Daily stretches/ }));
}

async function completeCurrentHold() {
  fireEvent.click(screen.getByRole('button', { name: 'Start hold' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
}

describe('StretchRoutine', () => {
  it('shows the home card and a preview whose hip choice updates the seven holds', () => {
    renderRoutine();
    expect(screen.getByRole('button', { name: /7 holds · 3½ minutes · 30 seconds each/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Daily stretches/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Figure four' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Half pigeon' })).not.toBeChecked();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(FIGURE_FOUR_NAMES);
    expect(screen.queryByText(/30 seconds total/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/15[- ]?second/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/countertop prayer stretch/i)).not.toBeInTheDocument();
    expect(document.querySelector('a')).toBeNull();
    expect(
      screen.getByText(/Lat stretch uses elbows on a secure countertop/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/feet elevated/i)).not.toBeInTheDocument();

    const sound = screen.getByRole('button', { name: 'Sound on' });
    expect(sound).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(sound);
    fireEvent.click(screen.getByRole('button', { name: 'Sound off' }));
    expect(playIntervalPing).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'Half pigeon' }));
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(HALF_PIGEON_NAMES);

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(playIntervalPing).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start hold' })).toHaveFocus();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pancake' })).toBeInTheDocument();
    expect(screen.getByText('Next: Half pigeon · Left')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('00:30');
    expect(screen.getByRole('button', { name: 'Start hold' })).toBeInTheDocument();
  });

  it('does not chime at hold boundaries when sound is off', async () => {
    openRoutine();
    fireEvent.click(screen.getByRole('button', { name: 'Sound on' }));
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start hold' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(playIntervalPing).not.toHaveBeenCalled();
    expect(screen.getByText('Hold complete. Take your time changing position.')).toBeInTheDocument();
  });

  it('chimes when a hold starts and finishes, and not when it resumes', async () => {
    openRoutine();
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start hold' }));
    expect(playIntervalPing).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });
    expect(screen.queryByText(/Hold complete/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(playIntervalPing).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(playIntervalPing).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(19_000);
    });
    expect(screen.queryByText(/Hold complete/i)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByText('Hold complete. Take your time changing position.')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(playIntervalPing).toHaveBeenCalledTimes(2);
  });

  it('saves one 3.5 minute session and ignores a second click while saving', async () => {
    let resolveSave: (value: unknown) => void = () => {};
    const onSave = vi.fn((_input: SessionInput) =>
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderRoutine(onSave);
    fireEvent.click(screen.getByRole('button', { name: /Daily stretches/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Half pigeon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));

    fireEvent.click(screen.getByRole('button', { name: 'Start hold' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next stretch' }));

    for (let index = 1; index < 7; index += 1) {
      await completeCurrentHold();
      fireEvent.click(
        screen.getByRole('button', { name: index === 6 ? 'Finish routine' : 'Next stretch' }),
      );
    }

    expect(screen.getByRole('status')).toHaveTextContent(
      'Routine complete — lasted 3.5 minutes of stretching.',
    );
    const saveButton = screen.getByRole('button', { name: 'Save stretches' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Good' }));
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);

    const input = onSave.mock.calls[0]![0];
    expect(input.durationMinutes).toBe(3.5);
    expect(input.reps).toBeNull();
    expect(input.activityLabel).toBe('Daily stretches');
    expect(input.rating).toBe(4);
    expect(input.focusRating).toBeUndefined();
    expect(input.energyRating).toBeUndefined();
    expect(input.moodRating).toBeUndefined();
    expect(input.startedAt).toBeInstanceOf(Date);
    expect(input.endedAt).toBeInstanceOf(Date);
    expect(input.endedAt!.getTime() - input.startedAt.getTime()).toBeGreaterThan(3.5 * 60_000);
    expect(input.note?.split('\n')).toEqual(HALF_PIGEON_NAMES.map((name) => `${name}: 30s`));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('Leave without saving this routine?')).not.toBeInTheDocument();

    await act(async () => {
      resolveSave(undefined);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an alert when saving fails and retries once', async () => {
    const onSave = vi.fn(async (_input: SessionInput) => undefined);
    onSave.mockRejectedValueOnce(new Error('disk'));
    onSave.mockResolvedValueOnce(undefined);

    renderRoutine(onSave);
    fireEvent.click(screen.getByRole('button', { name: /Daily stretches/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    for (let index = 0; index < 7; index += 1) {
      await completeCurrentHold();
      fireEvent.click(
        screen.getByRole('button', { name: index === 6 ? 'Finish routine' : 'Next stretch' }),
      );
    }
    fireEvent.click(screen.getByRole('button', { name: 'Good' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save stretches' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not save your stretches. Please try again.',
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save stretches' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save stretches' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes immediately before the first hold and confirms after it has started', async () => {
    openRoutine();
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Leave without saving this routine?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Daily stretches/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Daily stretches/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start hold' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('00:20');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText('Leave without saving this routine?')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Keep stretching' }));
    expect(screen.queryByText('Leave without saving this routine?')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('00:20');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard routine' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Leave without saving this routine?')).not.toBeInTheDocument();
  });
});
