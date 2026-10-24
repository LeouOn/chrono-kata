/**
 * The copies screen, the idle runner, the copy made before an import, restore from a copy, and Clear all
 * data (Wave 18 part 4): the real components over the real databases.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClearDataSettings } from '@/components/settings/ClearDataSettings';
import { CopiesSettings } from '@/components/settings/CopiesSettings';
import { DataTransfer } from '@/components/settings/DataTransfer';
import { AutoCopyRunner } from '@/components/system/AutoCopyRunner';
import { ToastProvider } from '@/components/ui/Toast';
import { COPIES_DB_NAME, deleteAllCopies, getCopiesDb } from '@/lib/copies/copies-db';
import { HONEST_LIMIT, copyLabel, copySummary, lastCopyLine } from '@/lib/copies/text';
import { COLLECTIONS } from '@/lib/data-transfer/collections';
import { listCopies, makeCopy, readCopyText } from '@/lib/copies/copies';
import { parseEnvelope } from '@/lib/data-transfer/import';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { diffTable } from '../data-transfer/oracle/compare';
import { buildDataset } from '../data-transfer/oracle/dataset';
import { backupTextOf, primaryKeys, readDb, seedDb } from '../data-transfer/oracle/harness';

const keys = () => primaryKeys();

beforeEach(async () => {
  cleanup();
  await resetDbForTesting();
  await deleteAllCopies();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{node}</ToastProvider>
    </QueryClientProvider>,
  );
}

async function flagOn() {
  await settingsRepo.setFlag('taskInbox', true);
}

/** Seed a generated dataset whose settings keep the preview flag on (a random settings row would switch it off). */
async function seedFlagged(data: ReturnType<typeof buildDataset>) {
  (data.settings![0] as Record<string, unknown>).flags = { taskInbox: true };
  await seedDb(data);
  return data;
}

describe('flag off: nothing', () => {
  it('shows no card, makes no copy, and does not even open the copies database', async () => {
    await seedDb(buildDataset(601, 'sparse', keys()));
    const queued: (() => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => queued.push(cb));
    wrap(<><CopiesSettings /><AutoCopyRunner /></>);
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByText('Copies on this device')).toBeNull();
    expect(queued, 'the runner must not even schedule work with the flag off').toHaveLength(0);
    queued.forEach((cb) => cb());
    expect(await Dexie.getDatabaseNames()).not.toContain(COPIES_DB_NAME);
  });
});

describe('the card', () => {
  beforeEach(flagOn);

  it('starts with "No copy yet.", makes one on request, and then says "Last copy: today."', async () => {
    await seedFlagged(buildDataset(602, 'full', keys()));
    wrap(<CopiesSettings />);
    await waitFor(() => expect(screen.getByTestId('last-copy').textContent).toBe('No copy yet.'));
    expect(screen.getByText(HONEST_LIMIT)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy now' }));
    await waitFor(() => expect(screen.getByTestId('last-copy').textContent).toBe('Last copy: today.'));
    expect(screen.getByTestId('copies-message').textContent).toBe('Made a copy of everything on this device.');
    const item = screen.getByTestId('copy-item');
    expect(item.textContent).toMatch(/^Today, \d\d:\d\dmade by you · \d[\d,]* tasks?, \d[\d,]* sessions? and \d+ projects? · \d+ (B|KB)/);
  });

  it('says how long ago in plain words, and never "overdue"', async () => {
    const now = new Date(2026, 5, 20, 10, 0);
    expect(lastCopyLine(null, now)).toBe('No copy yet.');
    expect(lastCopyLine(new Date(2026, 5, 20, 1, 0), now)).toBe('Last copy: today.');
    expect(lastCopyLine(new Date(2026, 5, 19, 23, 0), now)).toBe('Last copy: yesterday.');
    expect(lastCopyLine(new Date(2026, 5, 8, 9, 0), now)).toBe('Last copy: 12 days ago.');
    expect(copyLabel(new Date(2026, 5, 20, 9, 5), now)).toBe('Today, 09:05');
    expect(copyLabel(new Date(2026, 5, 19, 9, 5), now)).toBe('Yesterday, 09:05');
    expect(copyLabel(new Date(2026, 5, 8, 9, 5), now)).toBe('8 Jun, 09:05');
    expect(copySummary({ tasks: 214, sessions: 1310, projects: 12, habits: 3, domains: 4 })).toBe('214 tasks, 1,310 sessions and 12 projects');
    expect(copySummary({})).toBe('nothing yet');
    const words = [lastCopyLine(null, now), lastCopyLine(new Date(2026, 5, 8, 9, 0), now), HONEST_LIMIT].join(' ');
    expect(words).not.toMatch(/overdue|behind|missed|failed|lazy|should have|warning|danger|!/i);
  });

  it('keeps fewer when asked, applying it at once and saying so', async () => {
    await seedFlagged(buildDataset(603, 'sparse', keys()));
    for (let i = 0; i < 5; i += 1) await makeCopy('manual', new Date(2026, 5, 1 + i, 9, 0));
    wrap(<CopiesSettings />);
    await screen.findAllByTestId('copy-item');
    fireEvent.change(screen.getByLabelText(/^Keep the last/), { target: { value: '3' } });
    await waitFor(() => expect(screen.getAllByTestId('copy-item')).toHaveLength(3));
    expect(screen.getByTestId('copies-message').textContent).toBe('Keeping the last 3 copies.');
    expect((screen.getByLabelText(/^Keep the last/) as HTMLSelectElement).value).toBe('3');
  });

  it('deletes a copy only after asking, and never touches the data', async () => {
    await seedFlagged(buildDataset(604, 'sparse', keys()));
    await makeCopy('manual', new Date(2026, 5, 1, 9, 0));
    const before = await readDb();
    wrap(<CopiesSettings />);
    const item = await screen.findByTestId('copy-item');
    fireEvent.click(within(item).getByRole('button', { name: /^Delete the copy from / }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await listCopies()).toHaveLength(1);
    fireEvent.click(within(item).getByRole('button', { name: /^Delete the copy from / }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete copy' }));
    await waitFor(async () => expect(await listCopies()).toHaveLength(0));
    const after = await readDb();
    for (const t of Object.keys(before)) expect(diffTable(t, keys()[t]!, before[t]!, after[t]!)).toEqual([]);
  });

  it('says plainly when the last automatic copy could not be made', async () => {
    localStorage.setItem('chrono-kata-copies-error', "There isn't room left on this device to keep another copy.");
    wrap(<CopiesSettings />);
    expect((await screen.findByTestId('copies-problem')).textContent).toBe("The last automatic copy could not be made: There isn't room left on this device to keep another copy.");
  });

  it('names every control by its visible text (copies by their time) and makes the targets large', async () => {
    await seedFlagged(buildDataset(605, 'sparse', keys()));
    await makeCopy('manual', new Date());
    wrap(<CopiesSettings />);
    const item = await screen.findByTestId('copy-item');
    for (const b of within(item).getAllByRole('button')) {
      expect(b.className).toMatch(/min-h-11/);
      expect(b.getAttribute('aria-label') ?? b.textContent).toMatch(/Today, \d\d:\d\d|Look at this copy/);
    }
    expect(screen.getByRole('button', { name: 'Make a copy now' }).className).toMatch(/min-h-11/);
    expect(screen.getByLabelText(/^Keep the last/).className).toMatch(/min-h-11/);
  });
});

describe('restore from a copy', () => {
  beforeEach(flagOn);

  it('puts the data back as it was when the copy was made, and the replaced state is itself kept as a copy (so it can be undone)', async () => {
    const data = buildDataset(606, 'full', keys());
    await seedFlagged(data);
    const made = await makeCopy('manual');
    if (!made.ok || !('copy' in made)) throw new Error('no copy');
    // A bad day: every task gone, a project renamed.
    const { getDb } = await import('@/lib/db/db');
    await getDb().tasks.clear();
    await getDb().projects.toCollection().modify({ title: 'oops' });
    const damaged = await readDb();

    wrap(<CopiesSettings />);
    const item = (await screen.findAllByTestId('copy-item'))[0]!;
    fireEvent.click(within(item).getByRole('button', { name: /^Look at the copy from / }));
    const preview = await screen.findByTestId('import-preview');
    await waitFor(() => expect(within(preview).queryByText('Looking at what is on this device…')).toBeNull());
    fireEvent.click(within(preview).getByRole('radio', { name: 'Replace everything on this device' }));
    fireEvent.click(within(preview).getByRole('button', { name: 'Replace everything…' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Replace everything' }));
    await waitFor(() => expect(screen.getByTestId('copies-message').textContent).toMatch(/^Restored .* \(from the copy of /));

    const after = await readDb();
    const problems: string[] = [];
    // The data the person made comes back as it was. (Settings, keys and the sign-in are the device's: see the secrets rule.)
    for (const { key } of COLLECTIONS) problems.push(...diffTable(key, keys()[key]!, data[key]!, after[key] ?? []));
    expect(problems.join('\n')).toBe('');

    // The state it replaced was kept first.
    const copies = await listCopies();
    const safety = copies.find((c) => c.reason === 'before-import');
    expect(safety).toBeDefined();
    const kept = parseEnvelope((await readCopyText(safety!.id))!);
    if (!kept.ok) throw new Error(kept.error);
    expect(kept.envelope.tasks).toEqual([]);
    expect(kept.envelope.projects!.every((p) => p.title === 'oops')).toBe(true);
    void damaged;
  });

  it('a copy that cannot be read is not offered for restore, and says so', async () => {
    await seedFlagged(buildDataset(607, 'sparse', keys()));
    const made = await makeCopy('manual');
    if (!made.ok || !('copy' in made)) throw new Error('no copy');
    await getCopiesDb().copies.update(made.copy.id, { payload: Uint8Array.from([9, 9, 9, 9, 9, 9, 9, 9]) });
    wrap(<CopiesSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /^Look at the copy from / }));
    expect((await screen.findByTestId('copies-message')).textContent).toBe("That copy can't be read any more, so it can't be restored. You can delete it.");
    expect(screen.queryByTestId('import-preview')).toBeNull();
  });
});

describe('the copy made before an import', () => {
  beforeEach(flagOn);

  async function openImport(deviceSeed: number, fileSeed: number) {
    const device = buildDataset(deviceSeed, 'full', keys());
    await seedFlagged(device);
    wrap(<DataTransfer />);
    await screen.findByText(/Importing shows you what will change first/);
    const file = buildDataset(fileSeed, 'full', keys());
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File([backupTextOf(file)], 'b.json', { type: 'application/json' })] } });
    const preview = await screen.findByTestId('import-preview');
    await waitFor(() => expect(within(preview).queryByText('Looking at what is on this device…')).toBeNull());
    return { device, file, preview };
  }

  it('holds the state from BEFORE the import, for both ways in', async () => {
    for (const way of ['merge', 'replace'] as const) {
      cleanup();
      await resetDbForTesting();
      await deleteAllCopies();
      await flagOn();
      const { device, preview } = await openImport(610, 611);
      if (way === 'replace') {
        fireEvent.click(within(preview).getByRole('radio', { name: 'Replace everything on this device' }));
        fireEvent.click(within(preview).getByRole('button', { name: 'Replace everything…' }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Replace everything' }));
      } else {
        fireEvent.click(within(preview).getByRole('button', { name: 'Add what is missing' }));
      }
      await screen.findByTestId('backup-outcome');
      const copies = await listCopies();
      expect(copies.filter((c) => c.reason === 'before-import'), way).toHaveLength(1);
      const kept = parseEnvelope((await readCopyText(copies[0]!.id))!);
      if (!kept.ok) throw new Error(kept.error);
      expect(kept.envelope.tasks!.map((t) => t.id).sort(), way).toEqual(device.tasks!.map((t) => String(t.id)).sort());
    }
  });

  it('a copy that cannot be made stops the import, says why, and changes nothing until the person says to go on', async () => {
    const { preview } = await openImport(612, 613);
    const before = await readDb();
    vi.spyOn(getCopiesDb().copies, 'add').mockRejectedValue(Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' }));
    fireEvent.click(within(preview).getByRole('button', { name: 'Add what is missing' }));
    const alert = await within(preview).findByText(/A copy of what is on this device could not be made first/);
    expect(alert.textContent).toContain("There isn't room left on this device to keep another copy.), so nothing was imported.".replace('.),', '.),'));
    const mid = await readDb();
    for (const t of Object.keys(before)) expect(diffTable(t, keys()[t]!, before[t]!, mid[t]!)).toEqual([]);
    expect(screen.queryByTestId('backup-outcome')).toBeNull();

    // Going on is a separate, named choice.
    fireEvent.click(within(preview).getByRole('button', { name: 'Import without a safety copy' }));
    expect((await screen.findByTestId('backup-outcome')).textContent).toMatch(/^Added /);
    const after = await readDb();
    expect(after.tasks!.length).toBeGreaterThan(before.tasks!.length);
  });

  it('a device with nothing on it needs no safety copy, and the import goes straight through', async () => {
    wrap(<DataTransfer />);
    await screen.findByText(/Importing shows you what will change first/);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File([backupTextOf(buildDataset(614, 'sparse', keys()))], 'b.json')] } });
    const preview = await screen.findByTestId('import-preview');
    await waitFor(() => expect(within(preview).queryByText('Looking at what is on this device…')).toBeNull());
    fireEvent.click(within(preview).getByRole('button', { name: 'Add what is missing' }));
    await screen.findByTestId('backup-outcome');
    expect(await listCopies()).toEqual([]);
  });
});

describe('the idle runner', () => {
  beforeEach(flagOn);

  it('makes the day\'s copy when the browser is idle, only once, and not at all if the page goes away first', async () => {
    await seedFlagged(buildDataset(620, 'sparse', keys()));
    const queued: (() => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => queued.push(cb));
    vi.stubGlobal('cancelIdleCallback', vi.fn());

    const first = wrap(<AutoCopyRunner />);
    await waitFor(() => expect(queued.length).toBeGreaterThan(0));
    expect(await listCopies()).toEqual([]); // nothing yet: it waits for idle
    await act(async () => {
      queued.forEach((cb) => cb());
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(await listCopies()).toHaveLength(1);

    // The tab comes back later the same day: asks again, and the rule says no.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      queued.forEach((cb) => cb());
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(await listCopies()).toHaveLength(1);

    first.unmount();
    await deleteAllCopies();
    queued.length = 0;
    const second = wrap(<AutoCopyRunner />);
    await waitFor(() => expect(queued.length).toBeGreaterThan(0));
    second.unmount(); // gone before idle
    queued.forEach((cb) => cb());
    await new Promise((r) => setTimeout(r, 100));
    expect(await listCopies()).toEqual([]);
  });

  it('falls back to a timer where idle callbacks do not exist', async () => {
    await seedFlagged(buildDataset(621, 'sparse', keys()));
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      wrap(<AutoCopyRunner />);
      await vi.advanceTimersByTimeAsync(5_100);
    } finally {
      vi.useRealTimers();
    }
    await waitFor(async () => expect(await listCopies()).toHaveLength(1));
  });
});

describe('Clear all data', () => {
  it('takes the automatic copies with it (a wipe that left them behind would not be one)', async () => {
    await flagOn();
    await seedFlagged(buildDataset(630, 'sparse', keys()));
    await makeCopy('manual');
    await makeCopy('manual', new Date(Date.now() - 86_400_000));
    expect(await listCopies()).toHaveLength(2);
    expect(await Dexie.getDatabaseNames()).toContain(COPIES_DB_NAME);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    wrap(<ClearDataSettings />);
    expect(await screen.findByText(/including the automatic copies on this device/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all data' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Wipe everything' }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(await Dexie.getDatabaseNames()).not.toContain(COPIES_DB_NAME);
    expect(await Dexie.getDatabaseNames()).not.toContain('chrono-kata');
    expect(await listCopies()).toEqual([]); // a fresh, empty copies database
  });

  it('with the flag off the words are the old ones, and it still clears any copies that exist', async () => {
    await seedFlagged(buildDataset(631, 'sparse', keys()));
    await makeCopy('manual');
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    wrap(<ClearDataSettings />);
    expect(await screen.findByText('Wipes IndexedDB and reloads. Cannot be undone.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all data' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Wipe everything' }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(await Dexie.getDatabaseNames()).not.toContain(COPIES_DB_NAME);
  });
});
