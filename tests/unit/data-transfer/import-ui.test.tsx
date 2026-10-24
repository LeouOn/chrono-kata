/**
 * The Backup & Restore card with the import preview (Wave 18 part 2), driven through the real component,
 * the real parser, the real merge and replace, and a real (fake-indexeddb) database.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataTransfer } from '@/components/settings/DataTransfer';
import { ToastProvider } from '@/components/ui/Toast';
import { collectAll } from '@/lib/data-transfer/export';
import { MAX_BACKUP_CHARS } from '@/lib/data-transfer/guard';
import { getDb, resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { diffTable } from './oracle/compare';
import { buildDataset, makeRow } from './oracle/dataset';
import { failNthWrite } from './oracle/faults';
import { backupTextOf, plantSecrets, primaryKeys, readDb, seedDb } from './oracle/harness';

beforeEach(async () => {
  cleanup();
  await resetDbForTesting();
});
afterEach(() => cleanup());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <DataTransfer />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Mount with the flag on, and wait until the card has read it (its wording changes). */
async function mountEnhanced() {
  const view = mount();
  await screen.findByText(/Importing shows you what will change first/);
  return view;
}

async function chooseFile(text: string, size?: number) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([text], 'backup.json', { type: 'application/json' });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(input, { target: { files: [file] } });
}

const keys = () => primaryKeys();
async function snapshot() {
  return readDb();
}
async function unchangedSince(before: Awaited<ReturnType<typeof snapshot>>) {
  const after = await readDb();
  return Object.keys(before).flatMap((t) => diffTable(t, keys()[t]!, before[t]!, after[t]!));
}

/** A device and a file that overlap, as text. */
function scenario() {
  const device = buildDataset(81, 'full', keys());
  const file = buildDataset(82, 'full', keys());
  // two tasks the file shares with the device: one identical, one that differs
  file.tasks![0] = { ...device.tasks![0]! };
  file.tasks![1] = { ...file.tasks![1]!, id: device.tasks![1]!.id };
  return { device, file, text: backupTextOf(file) };
}

describe('flag off: the old card, unchanged', () => {
  it('keeps the old wording, the one-line dialog, and no preview', async () => {
    mount();
    expect(screen.getByText(/Importing replaces ALL local data/)).toBeTruthy();
    const { text } = scenario();
    await chooseFile(text);
    expect(await screen.findByText('Replace all data?')).toBeTruthy();
    expect(screen.queryByTestId('import-preview')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeTruthy();
  });

  it('a refused file is still the old toast, not the new message', async () => {
    mount();
    await chooseFile('not json at all');
    await waitFor(() => expect(screen.queryByTestId('backup-outcome')).toBeNull());
    expect(screen.queryByText(/Nothing on this device was changed/)).toBeNull();
  });
});

describe('flag on: the preview', () => {
  beforeEach(async () => {
    await settingsRepo.setFlag('taskInbox', true);
  });

  async function openPreview() {
    const { device, file, text } = scenario();
    await seedDb(device);
    await mountEnhanced();
    await chooseFile(text);
    const preview = await screen.findByTestId('import-preview');
    await waitFor(() => expect(within(preview).queryByText('Looking at what is on this device…')).toBeNull());
    return { device, file, preview };
  }

  it('shows what is in the file, with the real numbers, and defaults to the option that cannot take anything away', async () => {
    const { file, preview } = await openPreview();
    expect(within(preview).getByRole('heading', { name: 'This backup' })).toBeTruthy();
    expect(within(preview).getByText(new RegExp(`It holds ${file.tasks!.length} tasks`))).toBeTruthy();
    const add = within(preview).getByRole('radio', { name: 'Add what is missing' }) as HTMLInputElement;
    const replace = within(preview).getByRole('radio', { name: 'Replace everything on this device' }) as HTMLInputElement;
    expect(add.checked).toBe(true);
    expect(replace.checked).toBe(false);
    expect(within(preview).getByText(/This will add .*tasks.* to this device\./)).toBeTruthy();
    expect(within(preview).getByText(/of those differs? from the file's copy, and yours (is|are) kept/)).toBeTruthy();
    expect(within(preview).getByText(/Your API keys, Google Calendar sign-in and private calendar link stay on this device\./)).toBeTruthy();
  });

  it('"Not now" closes the preview and nothing changes', async () => {
    const { preview } = await openPreview();
    const before = await snapshot();
    fireEvent.click(within(preview).getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByTestId('import-preview')).toBeNull());
    expect(await unchangedSince(before)).toEqual([]);
  });

  it('adding what is missing adds it, keeps the device\'s own rows, and says exactly what happened', async () => {
    const { device, file, preview } = await openPreview();
    fireEvent.click(within(preview).getByRole('button', { name: 'Add what is missing' }));
    const outcome = await screen.findByTestId('backup-outcome');
    expect(outcome.textContent).toMatch(/^Added .*tasks/);
    expect(outcome.textContent).toMatch(/already here, left as they were \(\d+ differed from the file; yours were kept\)/);
    expect(screen.queryByTestId('import-preview')).toBeNull();

    const after = await readDb();
    const expectedTasks = [...device.tasks!, ...file.tasks!.slice(2)];
    expect(diffTable('tasks', 'id', expectedTasks, after.tasks!)).toEqual([]);
    // the task the file shares with the device but spells differently is the device's version
    expect(JSON.stringify(after.tasks!.find((t) => t.id === device.tasks![1]!.id))).toBe(JSON.stringify(device.tasks![1]));
    expect(diffTable('settings', 'id', device.settings!, after.settings!)).toEqual([]); // untouched
  });

  it('replace asks again, in numbers, and cancelling the question changes nothing', async () => {
    const { device, file, preview } = await openPreview();
    fireEvent.click(within(preview).getByRole('radio', { name: 'Replace everything on this device' }));
    fireEvent.click(within(preview).getByRole('button', { name: 'Replace everything…' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(new RegExp(`This will replace ${device.tasks!.length} tasks.* on this device with ${file.tasks!.length} tasks.* from the file\\. It can't be undone\\.`))).toBeTruthy();
    const before = await snapshot();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await unchangedSince(before)).toEqual([]);
    expect(screen.queryByTestId('import-preview')).toBeTruthy(); // still there to choose again
  });

  it('confirming the replace restores the file and reports it', async () => {
    const { file, preview } = await openPreview();
    fireEvent.click(within(preview).getByRole('radio', { name: 'Replace everything on this device' }));
    fireEvent.click(within(preview).getByRole('button', { name: 'Replace everything…' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace everything' }));
    const outcome = await screen.findByTestId('backup-outcome');
    expect(outcome.textContent).toMatch(/^Restored .*tasks.* from the file\.$/);
    const after = await readDb();
    expect(diffTable('tasks', 'id', file.tasks!, after.tasks!)).toEqual([]);
    expect(diffTable('sessions', 'id', file.sessions!, after.sessions!)).toEqual([]);
  });

  it('a write that fails midway leaves the device exactly as it was, and says so', async () => {
    const { preview } = await openPreview();
    const before = await snapshot();
    fireEvent.click(within(preview).getByRole('button', { name: 'Add what is missing' }));
    // (the click above already ran) — so repeat for a fresh preview with the fault armed first
    await screen.findByTestId('backup-outcome');
    cleanup();
    await resetDbForTesting();
    await settingsRepo.setFlag('taskInbox', true);
    const second = scenario();
    await seedDb(second.device);
    const base = await snapshot();
    await mountEnhanced();
    await chooseFile(second.text);
    const p = await screen.findByTestId('import-preview');
    await waitFor(() => expect(within(p).queryByText('Looking at what is on this device…')).toBeNull());
    const fault = failNthWrite(3);
    fireEvent.click(within(p).getByRole('button', { name: 'Add what is missing' }));
    const alert = await screen.findByRole('alert');
    fault.undo();
    expect(alert.textContent).toMatch(/nothing on this device was changed\. \(disk full\)/);
    expect(await unchangedSince(base)).toEqual([]);
    expect(screen.queryByTestId('import-preview')).toBeTruthy();
    void before;
  });

  it('says what the file leaves out, what could not be read, and what was repaired', async () => {
    const device = buildDataset(83, 'full', keys());
    plantSecrets(device);
    await seedDb(device);
    const exported = JSON.parse(JSON.stringify(await collectAll())) as Record<string, any>;
    exported.dayPlans[0].shutdownAt = 'not-a-date';
    exported.tasks.push('garbage');
    await mountEnhanced();
    await chooseFile(JSON.stringify(exported));
    const preview = await screen.findByTestId('import-preview');
    expect(within(preview).getByText(/This backup does not include your API keys/)).toBeTruthy();
    expect(within(preview).getByText(/1 record in the file could not be read, so it is skipped\./)).toBeTruthy();
    expect(within(preview).getByText(/1 record had a date that could not be read, so it comes back without it: 1 day plan\./)).toBeTruthy();
  });

  it('every control has a name that is its visible text, and the targets are large', async () => {
    const { preview } = await openPreview();
    for (const radio of within(preview).getAllByRole('radio')) {
      const label = radio.closest('label')!;
      expect(label.textContent!.trim().length).toBeGreaterThan(5);
      expect(label.className).toMatch(/min-h-11/);
    }
    for (const button of within(preview).getAllByRole('button')) {
      expect(button.textContent!.trim().length).toBeGreaterThan(3);
      expect(button.className).toMatch(/min-h-11/);
    }
  });

  it('uses no guilt wording anywhere in the card', async () => {
    const { preview } = await openPreview();
    expect(preview.textContent).not.toMatch(/overdue|behind|missed|failed|lazy|should have|too late|warning|danger|!/i);
  });
});

describe('flag on: a file that cannot be a backup', () => {
  beforeEach(async () => {
    await settingsRepo.setFlag('taskInbox', true);
  });

  const REFUSED: [string, string | (() => Promise<void>), RegExp][] = [
    ['text that is not JSON', 'MY-PRIVATE-NOTE {', /isn't valid JSON\. Nothing on this device was changed\./],
    ['a list', '[]', /doesn't look like a Chrono Kata backup\. Nothing on this device was changed\./],
    ['an unknown version', '{"version":9,"sessions":[]}', /version of the app that this one does not know\. Nothing on this device was changed\./],
    ['a file with a __proto__ key', '{"version":2,"sessions":[],"__proto__":{"polluted":true}}', /entries that a backup never has, so it was not read\. Nothing on this device was changed\./],
  ];
  for (const [name, text, expected] of REFUSED) {
    it(`refuses ${name}, calmly, with no preview, and writes nothing`, async () => {
      await seedDb(buildDataset(84, 'full', keys()));
      const before = await snapshot();
      await mountEnhanced();
      await chooseFile(text as string);
      const outcome = await screen.findByTestId('backup-outcome');
      expect(outcome.textContent).toMatch(expected);
      expect(outcome.textContent).not.toContain('PRIVATE');
      expect(screen.queryByTestId('import-preview')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(await unchangedSince(before)).toEqual([]);
    });
  }

  it('refuses a file larger than a backup can be without reading it', async () => {
    const reads = vi.spyOn(FileReader.prototype, 'readAsText');
    await mountEnhanced();
    await chooseFile('{}', MAX_BACKUP_CHARS + 1);
    const outcome = await screen.findByTestId('backup-outcome');
    expect(outcome.textContent).toMatch(/larger than a backup can be, so it was not read\. Nothing on this device was changed\./);
    expect(reads).not.toHaveBeenCalled();
    reads.mockRestore();
  });

  it('a refusal is replaced by the next good file\'s preview, not stacked on it', async () => {
    await mountEnhanced();
    await chooseFile('nope');
    await screen.findByTestId('backup-outcome');
    await chooseFile(scenario().text);
    await screen.findByTestId('import-preview');
    expect(screen.queryByTestId('backup-outcome')).toBeNull();
  });
});

describe('flag on: export', () => {
  beforeEach(async () => {
    await settingsRepo.setFlag('taskInbox', true);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('says what the file leaves out, in a sentence that stays on the page', async () => {
    const device = buildDataset(85, 'full', keys());
    plantSecrets(device);
    await seedDb(device);
    await mountEnhanced();
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
    const outcome = await screen.findByTestId('backup-outcome');
    expect(outcome.textContent).toMatch(/^Saved \d+ sessions? and the rest of your data\. This backup does not include your API keys/);
    expect(outcome.textContent).toMatch(/your Google Calendar sign-in/);
  });
});

void getDb;
void makeRow;
