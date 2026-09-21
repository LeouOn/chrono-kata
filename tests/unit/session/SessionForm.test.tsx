import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionForm } from '@/components/session/SessionForm';
import { resetDbForTesting } from '@/lib/db/db';
import type { SessionInput } from '@/lib/schemas/session';

afterEach(cleanup);

beforeEach(async () => {
  await resetDbForTesting();
});

beforeAll(() => {
  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(Date.now()), 16)) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) =>
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>)) as unknown as typeof cancelAnimationFrame;
  }
});

function renderForm() {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SessionForm open onSave={onSave} onCancel={onCancel} />
    </QueryClientProvider>
  );
  return { onSave, onCancel };
}

describe('SessionForm', () => {
  it('asks before discarding a running timer', async () => {
    const { onCancel } = renderForm();
    await screen.findByRole('heading', { name: /new session/i });

    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(await screen.findByText('Discard unsaved practice?')).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    await waitFor(() =>
      expect(screen.queryByText('Discard unsaved practice?')).toBeNull()
    );
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    fireEvent.click(await screen.findByRole('button', { name: /discard practice/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding a stopped-but-unsaved timer', async () => {
    const { onCancel } = renderForm();
    await screen.findByRole('heading', { name: /new session/i });

    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(await screen.findByText('Discard unsaved practice?')).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    await waitFor(() =>
      expect(screen.queryByText('Discard unsaved practice?')).toBeNull()
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    fireEvent.click(await screen.findByRole('button', { name: /discard practice/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes immediately when no timer is running', async () => {
    const { onCancel } = renderForm();
    await screen.findByRole('heading', { name: /new session/i });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard unsaved practice?')).toBeNull();
  });

  it('submits a backdated start time and derives endedAt from duration', async () => {
    const { onSave } = renderForm();
    await screen.findByRole('heading', { name: /new session/i });

    fireEvent.change(screen.getByLabelText(/^when/i), {
      target: { value: '2026-09-19T08:30' },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 20/i), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: /save session/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const input = onSave.mock.calls[0]![0] as SessionInput;
    expect(input.startedAt.getFullYear()).toBe(2026);
    expect(input.startedAt.getMonth()).toBe(8);
    expect(input.startedAt.getDate()).toBe(19);
    expect(input.startedAt.getHours()).toBe(8);
    expect(input.startedAt.getMinutes()).toBe(30);
    expect(input.endedAt?.getTime()).toBe(input.startedAt.getTime() + 25 * 60_000);
    expect(input.durationMinutes).toBe(25);
  });
});
