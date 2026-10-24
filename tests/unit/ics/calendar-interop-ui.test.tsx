import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { blockRepo } from '@/lib/db/block.repo';
import { SettingsSchema } from '@/lib/schemas/settings';
import { icsToBlocks } from '@/lib/ics/ics-import';
import { buildImportPreview } from '@/lib/ics/calendar-io';
import { CalendarInteropSettings } from '@/components/settings/CalendarInteropSettings';

const SIMPLE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//EN',
  'BEGIN:VEVENT',
  'UID:meet-1@cal',
  'SUMMARY:Team meeting',
  'DTSTART:20260302T090000Z',
  'DTEND:20260302T093000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

beforeEach(async () => {
  await resetDbForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  cleanup();
});

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CalendarInteropSettings />
    </QueryClientProvider>,
  );
}

function expectEveryControlNamed(scope: HTMLElement) {
  const controls = Array.from(scope.querySelectorAll<HTMLElement>('input, select, textarea, button'));
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    const name =
      control.getAttribute('aria-label') ??
      (control.getAttribute('aria-labelledby')
        ? document.getElementById(control.getAttribute('aria-labelledby')!)?.textContent
        : null) ??
      (control as HTMLInputElement).labels?.[0]?.textContent ??
      control.textContent ??
      '';
    expect(name.trim(), `${control.tagName} has no accessible name`).not.toBe('');
  }
}

describe('CalendarInteropSettings', () => {
  it('renders nothing and runs no queries while taskInbox is off (inertness)', async () => {
    const getAllSpy = vi.spyOn(blockRepo, 'getAll');
    renderCard();
    // Flag off: no card, no blocks query.
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Calendar' })).toBeNull());
    expect(getAllSpy).not.toHaveBeenCalled();
  });

  it('exposes labelled controls for every interactive element', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderCard();
    await screen.findByRole('heading', { name: 'Calendar' });
    expectEveryControlNamed(document.body);
  });

  it('previews a file import and writes only on Confirm', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const applySpy = vi.spyOn(blockRepo, 'applyCalendarImport');
    renderCard();
    await screen.findByRole('heading', { name: 'Calendar' });

    const input = screen.getByLabelText('Import from a file');
    fireEvent.change(input, { target: { files: [new File([SIMPLE_ICS], 'meetings.ics', { type: 'text/calendar' })] } });

    await waitFor(() => expect(screen.getByTestId('ics-preview')).toBeInTheDocument());
    expect(screen.getByText(/1 new ·/)).toBeInTheDocument();
    expect(applySpy).not.toHaveBeenCalled(); // nothing written before Confirm

    fireEvent.click(screen.getByRole('button', { name: /Save 1 block/ }));
    await waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
    const written = applySpy.mock.calls[0]![0];
    expect(written).toHaveLength(1);
    expect(written[0]!.calendarRef).toBe('meet-1@cal');
    expect(written[0]!.title).toBe('Team meeting');
  });

  it('a re-import of the same file is all unchanged and writes nothing', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const applySpy = vi.spyOn(blockRepo, 'applyCalendarImport');
    renderCard();
    await screen.findByRole('heading', { name: 'Calendar' });

    const input = screen.getByLabelText('Import from a file');
    const file = () => new File([SIMPLE_ICS], 'meetings.ics', { type: 'text/calendar' });
    fireEvent.change(input, { target: { files: [file()] } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Save 1 block/ })));
    fireEvent.click(screen.getByRole('button', { name: /Save 1 block/ }));
    // Await the observable completion of the confirm (preview gone) before
    // starting the re-import.
    await waitFor(() => expect(screen.queryByTestId('ics-preview')).toBeNull());
    expect(applySpy).toHaveBeenCalledTimes(1);

    // Re-import: preview says unchanged, no Save button appears.
    // (Re-query the node: the confirm re-rendered the tree, and firing on a
    // detached node dispatches into nowhere.)
    fireEvent.change(screen.getByLabelText('Import from a file'), { target: { files: [file()] } });
    await waitFor(() =>
      expect(screen.getByText(/0 new · 0 updated · 1 unchanged · 0 skipped/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
    expect(applySpy).toHaveBeenCalledTimes(1);
  });

  it('Confirm clicked twice in one act applies the import once (double-submit guard)', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const applySpy = vi
      .spyOn(blockRepo, 'applyCalendarImport')
      .mockImplementation(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    renderCard();
    await screen.findByRole('heading', { name: 'Calendar' });

    fireEvent.change(screen.getByLabelText('Import from a file'), {
      target: { files: [new File([SIMPLE_ICS], 'meetings.ics', { type: 'text/calendar' })] },
    });
    const save = await screen.findByRole('button', { name: /Save 1 block/ });
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save); // second click inside one act(): REF guard must eat it
    });
    await waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
  });

  it('a non-https address is never fetched and says why calmly', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderCard();
    await screen.findByRole('heading', { name: 'Calendar' });

    fireEvent.change(screen.getByLabelText(/calendar address/i), { target: { value: 'http://example.com/a.ics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/Only https addresses/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('remembering an address stores a validated https URL and the settings row still parses', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderCard();
    await screen.findByRole('heading', { name: 'Calendar' });

    fireEvent.change(screen.getByLabelText(/calendar address/i), {
      target: { value: 'https://example.com/my.ics' },
    });
    fireEvent.click(screen.getByLabelText('Remember this address'));

    await waitFor(async () => {
      const stored = await settingsRepo.get();
      expect(stored.icsSubscriptionUrl).toBe('https://example.com/my.ics');
      expect(SettingsSchema.safeParse(stored).success).toBe(true);
    });
  });

  it('unremembering clears the stored address', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({ icsSubscriptionUrl: 'https://example.com/my.ics' });
    renderCard();
    const checkbox = await screen.findByLabelText('Remember this address');
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    await waitFor(async () => {
      expect((await settingsRepo.get()).icsSubscriptionUrl ?? null).toBeNull();
    });
  });

  it('exports today\u2019s blocks via the Web Share path and the text round-trips', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const now = new Date();
    await blockRepo.create({
      start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0),
      end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0),
      kind: 'fixed',
      title: 'Deep work',
      taskId: null,
      projectId: null,
      calendarRef: null,
    });
    let sharedText: string | null = null;
    const share = vi.fn(async (data: ShareData & { files?: File[] }) => {
      sharedText = data.files?.[0] ? await data.files[0].text() : null;
    });
    Object.defineProperty(navigator, 'canShare', {
      value: (data: { files?: File[] }) => Array.isArray(data.files),
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    renderCard();
    // Let the blocks query resolve before clicking Export.
    await waitFor(async () => {
      expect(await blockRepo.getAll()).toHaveLength(1);
    });
    await act(async () => {});
    fireEvent.click(await screen.findByRole('button', { name: 'Export today' }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(sharedText).toBeTruthy();
    // Round trip: the shared text parses back to the same single block.
    const parsed = icsToBlocks(sharedText!, { now });
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]!.title).toBe('Deep work');
    expect(parsed.blocks[0]!.start.getTime()).toBe(
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0).getTime(),
    );
  });
});

describe('CalendarInteropSettings — review follow-ups', () => {
  it('rejects an address whose NORMALISED form exceeds the settings schema (fix 4)', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderCard();
    await screen.findByRole('heading', { name: 'Calendar' });

    // 123 raw chars with accents -> percent-encoded beyond 500.
    const raw = 'https://example.com/cal?name=' + 'ä'.repeat(120) + '&x=1';
    fireEvent.change(screen.getByLabelText(/calendar address/i), { target: { value: raw } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/too long once encoded/)).toBeInTheDocument();
    const stored = await settingsRepo.get();
    expect(stored.icsSubscriptionUrl ?? null).toBeNull();
  });

  it('an invalid address un-ticks Remember instead of lying (fix 5)', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    renderCard();
    await screen.findByRole('heading', { name: 'Calendar' });

    fireEvent.change(screen.getByLabelText(/calendar address/i), { target: { value: 'http://nope.example/a.ics' } });
    fireEvent.click(screen.getByLabelText('Remember this address'));
    expect(await screen.findByText(/Only https addresses/)).toBeInTheDocument();
    expect(screen.getByLabelText('Remember this address')).not.toBeChecked();
  });

  it('editing the address and Refreshing updates the stored value when Remember is on (fix 5)', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    await settingsRepo.patch({ icsSubscriptionUrl: 'https://example.com/old.ics' });
    const fetchMock = vi.fn(async () => new Response(SIMPLE_ICS, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderCard();
    await screen.findByRole('heading', { name: 'Calendar' });

    fireEvent.change(screen.getByLabelText(/calendar address/i), { target: { value: 'https://example.com/new.ics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(async () => {
      expect((await settingsRepo.get()).icsSubscriptionUrl).toBe('https://example.com/new.ics');
    });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/new.ics', expect.anything());
    vi.unstubAllGlobals();
  });

  it('a hung subscription fetch times out calmly and un-sticks Refresh (fix 6)', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const hungFetch = vi.fn(() => new Promise<Response>(() => { /* never resolves */ }));
    vi.stubGlobal('fetch', hungFetch);
    renderCard();
    await screen.findByRole('heading', { name: 'Calendar' }); // real timers until rendered

    vi.useFakeTimers();
    try {
      fireEvent.change(screen.getByLabelText(/calendar address/i), { target: { value: 'https://example.com/hang.ics' } });
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_500);
      });
      // Synchronous lookup: findByText would hang under fake timers.
      expect(screen.getByText(/took too long to answer/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('refuses an oversized calendar before reading it (fix 6)', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    const fetchMock = vi.fn(async () => new Response('', {
      status: 200,
      headers: { 'content-length': String(3 * 1024 * 1024) },
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderCard();
    await screen.findByRole('heading', { name: 'Calendar' });

    fireEvent.change(screen.getByLabelText(/calendar address/i), { target: { value: 'https://example.com/big.ics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/larger than the 2 MB limit/)).toBeInTheDocument();
    expect(screen.queryByTestId('ics-preview')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('a network/CORS failure suggests importing a file instead (fix 6)', async () => {
    await settingsRepo.setFlag('taskInbox', true);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    renderCard();
    await screen.findByRole('heading', { name: 'Calendar' });

    fireEvent.change(screen.getByLabelText(/calendar address/i), { target: { value: 'https://blocked.example/a.ics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/import the file instead/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
