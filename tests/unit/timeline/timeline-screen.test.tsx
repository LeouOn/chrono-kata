import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { blockRepo } from '@/lib/db/block.repo';
import { ToastProvider } from '@/components/ui/Toast';
import { TimelineScreen } from '@/components/timeline/TimelineScreen';
import { toLocalDateString } from '@/lib/utils/date';

const TODAY = toLocalDateString(new Date());

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => {
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

describe('timeline screen', () => {
  it('renders a preview message and no add control while the flag is off', async () => {
    renderScreen();
    expect(await screen.findByText(/part of the planning preview/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add a commitment/i })).toBeNull();
  });

  it('adds a fixed commitment through labelled inputs and persists it once', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /add a commitment/i }));

    const title = await screen.findByLabelText('Title');
    expect(title).toBeTruthy();
    expect(screen.getByLabelText('From')).toBeTruthy();
    expect(screen.getByLabelText('Until')).toBeTruthy();

    fireEvent.change(title, { target: { value: 'Dentist' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '07:07' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '08:00' } });
    const form = screen.getByRole('button', { name: /save block/i }).closest('form')!;
    // Double submit: the second click must not create a second row.
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(async () => {
      const blocks = await blockRepo.range(new Date(Date.now() - 24 * 3_600_000), new Date(Date.now() + 24 * 3_600_000));
      expect(blocks.filter((block) => block.title === 'Dentist')).toHaveLength(1);
    });
    const blocks = await blockRepo.range(new Date(Date.now() - 24 * 3_600_000), new Date(Date.now() + 24 * 3_600_000));
    const saved = blocks.find((block) => block.title === 'Dentist')!;
    expect(saved.kind).toBe('fixed');
    expect(saved.start.getHours()).toBe(7);
    expect(saved.start.getMinutes()).toBe(7);
  });

  it('refuses an empty title with a plain message and writes nothing', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /add a commitment/i }));
    fireEvent.change(await screen.findByLabelText('From'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '10:00' } });
    fireEvent.submit(screen.getByRole('button', { name: /save block/i }).closest('form')!);
    expect((await screen.findByRole('alert')).textContent).toMatch(/give this block a title/i);
    const db = await getDb();
    expect(await db.blocks.count()).toBe(0);
  });

  it('refuses an end before the start with a plain message and writes nothing', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /add a commitment/i }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Backwards' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '11:00' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '10:00' } });
    fireEvent.submit(screen.getByRole('button', { name: /save block/i }).closest('form')!);
    expect((await screen.findByRole('alert')).textContent).toMatch(/end time needs to be after the start/i);
    const db = await getDb();
    expect(await db.blocks.filter((block) => block.title === 'Backwards').count()).toBe(0);
  });

  it('names an overlap in plain words and still lets both blocks be tapped', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    await blockRepo.create({ start, end: new Date(start.getTime() + 2 * 3_600_000), kind: 'fixed', title: 'A' });
    await blockRepo.create({ start: new Date(start.getTime() + 3_600_000), end: new Date(start.getTime() + 3 * 3_600_000), kind: 'fixed', title: 'B' });
    renderScreen();
    expect(await screen.findByText(/One time overlap/i)).toBeTruthy();
    expect(await screen.findByText(/share 10:00–11:00/i)).toBeTruthy();
    expect(await screen.findByRole('button', { name: /fixed block B/i })).toBeTruthy();
    expect((await screen.findByRole('button', { name: /fixed block A/i })).className).toContain('ring-accent');
  });

  it('edits and removes a commitment from its block sheet', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    const block = await blockRepo.create({
      start,
      end: new Date(start.getTime() + 60 * 60_000),
      kind: 'fixed',
      title: 'School run',
    });
    renderScreen();
    const openSchool = await screen.findByRole('button', { name: /fixed block School run/i });
    fireEvent.pointerDown(openSchool);
    fireEvent.pointerUp(openSchool);
    const title = await screen.findByLabelText('Title');
    expect((title as HTMLInputElement).value).toBe('School run');
    fireEvent.change(title, { target: { value: 'School pickup' } });
    fireEvent.submit(screen.getByRole('button', { name: /save block/i }).closest('form')!);
    await waitFor(async () => {
      const updated = await blockRepo.getById(block.id);
      expect(updated?.title).toBe('School pickup');
    });

    const reopen = await screen.findByRole('button', { name: /fixed block School pickup/i });
    fireEvent.pointerDown(reopen);
    fireEvent.pointerUp(reopen);
    fireEvent.click(await screen.findByRole('button', { name: /remove this block/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }));
    await waitFor(async () => {
      expect(await blockRepo.getById(block.id)).toBeUndefined();
    });
  });
});
