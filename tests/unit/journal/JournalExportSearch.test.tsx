import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JournalExportCard } from '@/components/journal/JournalExportCard';
import { JournalSearchCard } from '@/components/journal/JournalSearchCard';
import { resetDbForTesting } from '@/lib/db/db';
import { journalRepo } from '@/lib/db/journal.repo';
import { taskRepo } from '@/lib/db/task.repo';
import { domainRepo } from '@/lib/db/domain.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { exportDayMarkdown, exportMonthMarkdown, exportWeekMarkdown } from '@/lib/journal/export';

const offer = vi.fn();
vi.mock('@/lib/journal/handoff', () => ({
  offerTextFile: (...args: unknown[]) => offer(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(async () => {
  await resetDbForTesting();
  await settingsRepo.setFlag('taskInbox', true);
  offer.mockResolvedValue('downloaded');
});

function renderWithProviders(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

async function seedDays() {
  await dayPlanRepo.upsert('2026-06-15', { picks: [], capacityMin: 120 });
  await journalRepo.saveDayFields('2026-06-15', {
    journal: 'Worked on position\nsizing today.\n\nAlso  double  spaced words.',
    shutdownNote: 'Left the trading review for tomorrow.',
  });
  await dayPlanRepo.upsert('2026-06-16', { picks: [], capacityMin: 120 });
  await journalRepo.saveDayFields('2026-06-16', { firstActionTomorrow: 'Start with trading prep.' });
  await dayPlanRepo.upsert('2026-06-17', { picks: [], capacityMin: 120 });
  await journalRepo.saveDayFields('2026-06-17', { journal: 'A quiet day.' });
}

async function storedInput() {
  return { plans: await journalRepo.listAll(), tasks: await taskRepo.getAll(), domains: await domainRepo.getAll() };
}

describe('journalRepo.listAll', () => {
  it('returns every day, newest first', async () => {
    await seedDays();
    const all = await journalRepo.listAll();
    expect(all.map((row) => row.date)).toEqual(['2026-06-17', '2026-06-16', '2026-06-15']);
  });
});

describe('JournalExportCard', () => {
  it('says plainly that the markdown is a readable copy, not a backup', async () => {
    renderWithProviders(<JournalExportCard dayKey="2026-06-15" plan={null} />);
    expect(
      await screen.findByText(/This is a readable copy of your journal\. It is not a backup\./),
    ).toBeTruthy();
  });

  it('exports the day by default, and the file is exactly the pure export', async () => {
    await seedDays();
    const plan = await journalRepo.findByDate('2026-06-15');
    renderWithProviders(<JournalExportCard dayKey="2026-06-15" plan={plan} />);

    const download = (await screen.findByRole('button', { name: 'Download markdown' })) as HTMLButtonElement;
    await waitFor(() => expect(download.disabled).toBe(false));
    fireEvent.click(download);
    await waitFor(() => expect(offer).toHaveBeenCalledTimes(1));

    expect(offer.mock.calls[0]![0]).toBe('chrono-kata-journal-day-2026-06-15.md');
    expect(offer.mock.calls[0]![1]).toBe(exportDayMarkdown('2026-06-15', await storedInput()));
    expect(await screen.findByRole('status')).toHaveTextContent('Journal file downloaded.');
  });

  it('exports the week and the month when those ranges are chosen', async () => {
    await seedDays();
    const plan = await journalRepo.findByDate('2026-06-15');
    renderWithProviders(<JournalExportCard dayKey="2026-06-15" plan={plan} />);

    const download = (await screen.findByRole('button', { name: 'Download markdown' })) as HTMLButtonElement;
    await waitFor(() => expect(download.disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'This week: export week' }));
    fireEvent.click(download);
    await waitFor(() => expect(offer).toHaveBeenCalledTimes(1));
    expect(offer.mock.calls[0]![0]).toBe('chrono-kata-journal-week-week-2026-06-15.md');
    expect(offer.mock.calls[0]![1]).toBe(exportWeekMarkdown('2026-06-15', await storedInput()));

    offer.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'This month: export month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download markdown' }));
    await waitFor(() => expect(offer).toHaveBeenCalledTimes(1));
    expect(offer.mock.calls[0]![1]).toBe(exportMonthMarkdown('2026-06-15', await storedInput()));
  });

  it('says nothing when the person dismisses the share sheet', async () => {
    await seedDays();
    offer.mockResolvedValueOnce('cancelled');
    const plan = await journalRepo.findByDate('2026-06-15');
    renderWithProviders(<JournalExportCard dayKey="2026-06-15" plan={plan} />);

    const download = (await screen.findByRole('button', { name: 'Download markdown' })) as HTMLButtonElement;
    await waitFor(() => expect(download.disabled).toBe(false));
    fireEvent.click(download);

    await waitFor(() => expect(offer).toHaveBeenCalledTimes(1));
    // A cancelled share is a decision: no error, no "downloaded" claim.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reads the journal fresh at click time, not from the cache', async () => {
    await seedDays();
    const plan = await journalRepo.findByDate('2026-06-15');
    renderWithProviders(<JournalExportCard dayKey="2026-06-15" plan={plan} />);
    const download = (await screen.findByRole('button', { name: 'Download markdown' })) as HTMLButtonElement;
    await waitFor(() => expect(download.disabled).toBe(false));

    // A day written after the cache loaded, with no invalidation: the month file
    // must still contain it, because the card reads the repository at click time.
    await dayPlanRepo.upsert('2026-06-18', { picks: [], capacityMin: 0 });
    await journalRepo.saveDayFields('2026-06-18', { journal: 'A late entry.' });

    fireEvent.click(screen.getByRole('button', { name: 'This month: export month' }));
    fireEvent.click(download);
    await waitFor(() => expect(offer).toHaveBeenCalledTimes(1));
    expect(String(offer.mock.calls[0]![1])).toContain('A late entry.');
  });

  it('says calmly when the hand-off fails, and keeps the button usable', async () => {
    await seedDays();
    offer.mockRejectedValueOnce(new Error('no download here'));
    const plan = await journalRepo.findByDate('2026-06-15');
    renderWithProviders(<JournalExportCard dayKey="2026-06-15" plan={plan} />);

    const download = (await screen.findByRole('button', { name: 'Download markdown' })) as HTMLButtonElement;
    await waitFor(() => expect(download.disabled).toBe(false));
    fireEvent.click(download);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be handed over');

    fireEvent.click(screen.getByRole('button', { name: 'Download markdown' }));
    await waitFor(() => expect(offer).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('status')).toHaveTextContent('Journal file downloaded.');
  });

  it('does not export before the entries have loaded', async () => {
    await seedDays();
    const real = journalRepo.listAll.bind(journalRepo);
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(journalRepo, 'listAll').mockImplementation(async () => {
      await gate;
      return real();
    });
    const plan = await journalRepo.findByDate('2026-06-15');
    renderWithProviders(<JournalExportCard dayKey="2026-06-15" plan={plan} />);

    const download = (await screen.findByRole('button', { name: 'Download markdown' })) as HTMLButtonElement;
    // A list that has not arrived would export an empty document.
    expect(download.disabled).toBe(true);
    release!();
    await waitFor(() => expect(download.disabled).toBe(false));
  });

  it('cannot export a day that has no entry, but can still export its week', async () => {
    renderWithProviders(<JournalExportCard dayKey="2026-06-15" plan={null} />);
    const download = await screen.findByRole('button', { name: 'Download markdown' });
    expect((download as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'This week: export week' }));
    expect((download as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('JournalSearchCard', () => {
  it('finds a multi-word phrase across a line break and links to that day', async () => {
    await seedDays();
    renderWithProviders(<JournalSearchCard />);

    const box = await screen.findByLabelText('Search the journal');
    fireEvent.change(box, { target: { value: 'position sizing' } });

    const hit = await screen.findByRole('link', { name: /Open the entry for Monday 15 June 2026/ });
    expect(hit).toHaveAttribute('href', '/journal?date=2026-06-15');
    expect(hit.textContent).toContain('position sizing');
    expect(hit.textContent).toContain('in journal');
    expect(screen.getByText('1 entry')).toBeTruthy();
  });

  it('finds a phrase across a double space and reports the right field', async () => {
    await seedDays();
    renderWithProviders(<JournalSearchCard />);
    fireEvent.change(await screen.findByLabelText('Search the journal'), {
      target: { value: 'double spaced' },
    });
    const hit = await screen.findByRole('link', { name: /Monday 15 June 2026/ });
    expect(hit.textContent).toContain('double spaced');
  });

  it('says when nothing matches, and matches nothing for an empty query', async () => {
    await seedDays();
    renderWithProviders(<JournalSearchCard />);
    const box = await screen.findByLabelText('Search the journal');

    fireEvent.change(box, { target: { value: 'kata practise' } });
    expect(await screen.findByText('Nothing matches that yet.')).toBeTruthy();

    fireEvent.change(box, { target: { value: '   ' } });
    await waitFor(() => expect(screen.queryByText('Nothing matches that yet.')).toBeNull());
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('searches the shutdown note and tomorrow’s first move too', async () => {
    await seedDays();
    renderWithProviders(<JournalSearchCard />);
    fireEvent.change(await screen.findByLabelText('Search the journal'), { target: { value: 'trading' } });

    const links = await screen.findAllByRole('link', { name: /Open the entry for/ });
    expect(links).toHaveLength(2);
    const texts = links.map((link) => link.textContent ?? '');
    expect(texts.some((text) => text.includes('shutdown note'))).toBe(true);
    expect(texts.some((text) => text.includes("tomorrow's first move"))).toBe(true);
  });
});
