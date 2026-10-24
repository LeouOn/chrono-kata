import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { blockRepo } from '@/lib/db/block.repo';
import { ToastProvider } from '@/components/ui/Toast';
import { TimelineScreen } from '@/components/timeline/TimelineScreen';
import { toLocalDateString } from '@/lib/utils/date';
import { icsToBlocks } from '@/lib/ics/ics-import';

const TODAY = toLocalDateString(new Date());

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <TimelineScreen dayKey={TODAY} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function seedCommitment(title: string, hour: number) {
  const [y, m, d] = TODAY.split('-').map(Number);
  await blockRepo.create({
    start: new Date(y, m - 1, d, hour, 0),
    end: new Date(y, m - 1, d, hour + 1, 0),
    kind: 'fixed',
    title,
    taskId: null,
    projectId: null,
    calendarRef: null,
  });
}

function stubShare() {
  const captured: { text: string; name: string }[] = [];
  const share = vi.fn(async (data: { files?: File[]; title?: string }) => {
    const file = data.files?.[0];
    captured.push({ text: file ? await file.text() : '', name: file?.name ?? '' });
  });
  Object.defineProperty(navigator, 'canShare', {
    value: (data: { files?: File[] }) => Array.isArray(data.files),
    configurable: true,
  });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  return { captured, share };
}

describe('timeline export button', () => {
  it('is absent while the flag is off', async () => {
    renderScreen();
    expect(await screen.findByText(/part of the planning preview/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /export this day/i })).toBeNull();
  });

  it('exports the day\u2019s fixed commitments via the share hand-off and the text round-trips', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await seedCommitment('Dentist', 10);
    await seedCommitment('Trading session', 15);
    const { captured } = stubShare();

    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /export this day/i }));

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]!.name).toBe(`chrono-kata-${TODAY}.ics`);
    const parsed = icsToBlocks(captured[0]!.text, { now: new Date() });
    expect(parsed.blocks.map((b) => b.title).sort()).toEqual(['Dentist', 'Trading session']);
  });

  it('reads fresh at click time: a block created after render is included', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const { captured } = stubShare();

    renderScreen();
    await screen.findByRole('button', { name: /export this day/i });
    await seedCommitment('Late addition', 18); // after render
    fireEvent.click(screen.getByRole('button', { name: /export this day/i }));

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]!.text).toContain('Late addition');
  });

  it('says so calmly when there is nothing to export', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const { captured } = stubShare();

    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /export this day/i }));

    await waitFor(() => expect(screen.getByText(/No commitments on this day to export yet/)).toBeInTheDocument());
    expect(captured).toHaveLength(0);
  });

  it('a dismissed share sheet is silent (no error, no toast)', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await seedCommitment('Physio', 9);
    const abort = Object.assign(new Error('dismissed'), { name: 'AbortError' });
    Object.defineProperty(navigator, 'canShare', {
      value: (data: { files?: File[] }) => Array.isArray(data.files),
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(async () => { throw abort; }),
      configurable: true,
    });

    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /export this day/i }));
    await waitFor(() =>
      expect(screen.queryByText(/Shared the calendar file|downloaded|copied|Could not hand off/)).toBeNull(),
    );
  });
});
