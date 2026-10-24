import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { blockRepo } from '@/lib/db/block.repo';
import { ToastProvider } from '@/components/ui/Toast';
import { TimelineScreen } from '@/components/timeline/TimelineScreen';
import { toLocalDateString } from '@/lib/utils/date';

const TODAY = toLocalDateString(new Date());

beforeEach(async () => {
  await resetDbForTesting();
  await settingsRepo.patch({ wakingHours: { start: '09:00', end: '17:00' } });
  await settingsRepo.setFlag('taskInbox', true);
});
afterEach(cleanup);

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <TimelineScreen dayKey={TODAY} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

async function waitForBlocks(client: QueryClient) {
  await waitFor(() => {
    const loaded = client
      .getQueryCache()
      .getAll()
      .some((query) => query.queryKey[0] === 'timelineBlocks' && query.state.status === 'success');
    expect(loaded).toBe(true);
  });
}

function at(hours: number, minutes = 0): Date {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

describe('commitments outside the waking window', () => {
  it('keeps a before-window commitment on today, lists it, and edits it without moving it', async () => {
    const block = await blockRepo.create({
      start: at(7, 30),
      end: at(8, 30),
      kind: 'fixed',
      title: 'Commute',
      });
    renderScreen();
    const outside = await screen.findByRole('button', { name: /outside block Commute 07:30 to 08:30/i });
    expect(outside).toBeTruthy();
    fireEvent.click(outside);
    fireEvent.submit((await screen.findByRole('button', { name: /save block/i })).closest('form')!);
    await waitFor(async () => {
      const saved = (await blockRepo.getById(block.id))!;
      expect(saved.start.getDate()).toBe(at(7, 30).getDate());
      expect(saved.start.getHours()).toBe(7);
    });
    expect((await screen.findByRole('status')).textContent).toMatch(/outside your waking hours/i);
  });

  it('stores a before-window clock added through the sheet on today, not tomorrow', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /add a commitment/i }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Commute' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '07:30' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '08:30' } });
    fireEvent.submit(screen.getByRole('button', { name: /save block/i }).closest('form')!);
    const outside = await screen.findByRole('button', { name: /outside block Commute 07:30 to 08:30/i });
    expect(outside).toBeTruthy();
    const blocks = await blockRepo.range(new Date(at(0)), new Date(at(23, 59)));
    const saved = blocks.find((block) => block.title === 'Commute')!;
    expect(saved.start.getDate()).toBe(at(7, 30).getDate());
    expect(saved.start.getHours()).toBe(7);
    expect((await screen.findByRole('status')).textContent).toMatch(/outside your waking hours/i);
  });

  it('does not list tomorrow\'s commitment as outside today\'s waking hours', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(7, 30, 0, 0);
    await blockRepo.create({
      start: tomorrow,
      end: new Date(tomorrow.getTime() + 3_600_000),
      kind: 'fixed',
      title: 'Tomorrow commute',
    });
    const { client } = renderScreen();
    await waitForBlocks(client);
    expect(screen.queryByRole('button', { name: /outside block Tomorrow commute/i })).toBeNull();
  });

  it('lists an outside block but does not also draw it on the timeline', async () => {
    await blockRepo.create({
      start: at(7, 30),
      end: at(8, 30),
      kind: 'fixed',
      title: 'Commute',
    });
    renderScreen();
    expect(await screen.findByRole('button', { name: /outside block Commute 07:30 to 08:30/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /fixed block Commute/i })).toBeNull();
  });

  it('clears the outside notice after the block is removed', async () => {
    await blockRepo.create({
      start: at(7, 30),
      end: at(8, 30),
      kind: 'fixed',
      title: 'Commute',
    });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /outside block Commute/i }));
    fireEvent.submit((await screen.findByRole('button', { name: /save block/i })).closest('form')!);
    expect((await screen.findByRole('status')).textContent).toMatch(/outside your waking hours/i);
    fireEvent.click(screen.getByRole('button', { name: /outside block Commute/i }));
    // Opening the next sheet clears the previous save notice immediately.
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    fireEvent.click(await screen.findByRole('button', { name: /remove this block/i }));
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('lists an after-window commitment and saves it on today', async () => {
    const block = await blockRepo.create({
      start: at(18),
      end: at(19),
      kind: 'fixed',
      title: 'Dinner',
    });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /outside block Dinner 18:00 to 19:00/i }));
    fireEvent.submit((await screen.findByRole('button', { name: /save block/i })).closest('form')!);
    await waitFor(async () => {
      const saved = (await blockRepo.getById(block.id))!;
      expect(saved.start.getDate()).toBe(at(18).getDate());
      expect(saved.start.getHours()).toBe(18);
    });
  });
});
