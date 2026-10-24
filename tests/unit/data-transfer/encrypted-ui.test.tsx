/**
 * Saving and opening an encrypted backup through the Backup & Restore card (Wave 18 part 3): the real
 * component, the real WebCrypto, the real parser and database.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataTransfer } from '@/components/settings/DataTransfer';
import { ToastProvider } from '@/components/ui/Toast';
import { CANNOT_OPEN, isEncryptedBackup, MIN_ITERATIONS } from '@/lib/data-transfer/encrypted';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { diffTable } from './oracle/compare';
import { buildDataset } from './oracle/dataset';
import { SECRET, plantSecrets, primaryKeys, readDb, seedDb } from './oracle/harness';

const saved = vi.hoisted(() => ({ calls: [] as { text: string; name: string }[] }));
vi.mock('@/lib/data-transfer/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data-transfer/export')>()),
  downloadText: (text: string, name: string) => {
    saved.calls.push({ text, name });
  },
}));

const PASS = 'correct horse battery';
const keys = () => primaryKeys();

beforeEach(async () => {
  cleanup();
  saved.calls = [];
  await resetDbForTesting();
  await settingsRepo.setFlag('taskInbox', true);
});
afterEach(() => cleanup());

async function mountEnhanced() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <DataTransfer />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await screen.findByText(/Importing shows you what will change first/);
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function saveEncrypted(passphrase = PASS, tick = false) {
  fireEvent.click(screen.getByRole('button', { name: 'Export encrypted…' }));
  const form = await screen.findByTestId('encrypted-export');
  type('Passphrase', passphrase);
  type('Type it again', passphrase);
  if (tick) fireEvent.click(within(form).getByRole('checkbox'));
  fireEvent.click(within(form).getByRole('button', { name: 'Save encrypted file' }));
  await waitFor(() => expect(saved.calls).toHaveLength(1));
  return saved.calls[0]!;
}

async function chooseText(text: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File([text], 'backup.json', { type: 'application/json' })] } });
}

async function deviceWithSecrets(seed = 401) {
  const data = buildDataset(seed, 'full', keys());
  plantSecrets(data);
  await seedDb(data);
  return data;
}

describe('flag off', () => {
  it('has no encrypted export, and a pasted encrypted file is not special', async () => {
    await resetDbForTesting(); // flag off
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><ToastProvider><DataTransfer /></ToastProvider></QueryClientProvider>);
    expect(screen.queryByRole('button', { name: 'Export encrypted…' })).toBeNull();
    await chooseText(JSON.stringify({ format: 'chrono-kata-encrypted-backup', version: 1 }));
    await waitFor(() => expect(screen.queryByTestId('passphrase-prompt')).toBeNull());
  });
});

describe('saving an encrypted backup', () => {
  it('asks for the passphrase twice, will not save until they match and are long enough, and says so calmly', async () => {
    await deviceWithSecrets();
    await mountEnhanced();
    fireEvent.click(screen.getByRole('button', { name: 'Export encrypted…' }));
    const form = await screen.findByTestId('encrypted-export');
    const save = within(form).getByRole('button', { name: 'Save encrypted file' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    type('Passphrase', 'short');
    type('Type it again', 'short');
    expect(save.disabled).toBe(true); // matches, but too short
    type('Passphrase', PASS);
    expect(save.disabled).toBe(true);
    expect(within(form).getByRole('status').textContent).toBe('The two do not match yet.');
    type('Type it again', PASS);
    expect(save.disabled).toBe(false);
    expect(within(form).queryByRole('status')).toBeNull();
    expect(saved.calls).toHaveLength(0);
  });

  it('the passphrase fields are password fields that do not invite the browser to save them as a login', async () => {
    await mountEnhanced();
    fireEvent.click(screen.getByRole('button', { name: 'Export encrypted…' }));
    for (const label of ['Passphrase', 'Type it again']) {
      const field = screen.getByLabelText(label) as HTMLInputElement;
      expect(field.type).toBe('password');
      expect(field.getAttribute('autocomplete')).toBe('new-password');
    }
    expect(screen.getByText(/a forgotten passphrase cannot be recovered: nobody can open the file without it, and there is no reset\./)).toBeTruthy();
  });

  it('the secrets box is OFF, clearly worded, and off again every time the form is opened', async () => {
    await mountEnhanced();
    fireEvent.click(screen.getByRole('button', { name: 'Export encrypted…' }));
    const box = screen.getByRole('checkbox', { name: 'Also include my API keys, Google sign-in and private calendar link in this encrypted file' }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.getByText(/Ticked, anyone who has both this file and the passphrase can use them\./)).toBeTruthy();
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export encrypted…' }));
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('unticked: the file holds no secret, no title, and the card says the secrets are not in it', async () => {
    const data = await deviceWithSecrets();
    await mountEnhanced();
    const call = await saveEncrypted();
    expect(call.name).toMatch(/^chrono-kata-backup-\d{4}-\d{2}-\d{2}\.encrypted\.json$/);
    expect(isEncryptedBackup(call.text)).toBe(true);
    for (const s of [SECRET.accessToken, SECRET.icsUrl, SECRET.apiKey('planted-browser'), String(data.tasks![0]!.title)]) expect(call.text).not.toContain(s);
    const outcome = await screen.findByTestId('backup-outcome');
    expect(outcome.textContent).toMatch(/^Saved an encrypted backup of \d+ sessions? and the rest of your data\. Your API keys, Google Calendar sign-in and private calendar link are not in it\.$/);
    expect(screen.queryByTestId('encrypted-export')).toBeNull();
  });

  it('ticked: the secrets are inside, still not readable in the file, and the card says they are inside', async () => {
    await deviceWithSecrets();
    await mountEnhanced();
    const call = await saveEncrypted(PASS, true);
    for (const s of [SECRET.accessToken, SECRET.icsUrl, SECRET.apiKey('planted-browser')]) expect(call.text).not.toContain(s);
    const outcome = await screen.findByTestId('backup-outcome');
    expect(outcome.textContent).toMatch(/Also inside it: \d+ API keys?, your Google Calendar sign-in and your private calendar link\.$/);
  });

  it('never leaves the passphrase anywhere on the page, and clears the fields', async () => {
    await deviceWithSecrets();
    await mountEnhanced();
    await saveEncrypted('PASSPHRASE-LEAK-CHECK-77');
    await screen.findByTestId('backup-outcome');
    expect(document.body.innerHTML).not.toContain('LEAK-CHECK');
    expect(saved.calls[0]!.text).not.toContain('LEAK-CHECK');
  });
});

describe('opening an encrypted backup', () => {
  async function encryptedFileOf(tick: boolean) {
    const data = await deviceWithSecrets(402);
    await mountEnhanced();
    const call = await saveEncrypted(PASS, tick);
    cleanup();
    return { data, text: call.text };
  }

  it('asks for the passphrase first and shows nothing of the file until it opens', async () => {
    const { text } = await encryptedFileOf(false);
    await resetDbForTesting();
    await settingsRepo.setFlag('taskInbox', true);
    await mountEnhanced();
    await chooseText(text);
    const prompt = await screen.findByTestId('passphrase-prompt');
    expect(within(prompt).getByRole('heading', { name: 'This backup is encrypted' })).toBeTruthy();
    expect((within(prompt).getByLabelText('Passphrase') as HTMLInputElement).type).toBe('password');
    expect(screen.queryByTestId('import-preview')).toBeNull();
  });

  it('a wrong passphrase gets the one calm sentence, empties the field, keeps the prompt, and changes nothing', async () => {
    const { text } = await encryptedFileOf(false);
    await resetDbForTesting();
    await settingsRepo.setFlag('taskInbox', true);
    const before = await readDb();
    await mountEnhanced();
    await chooseText(text);
    const prompt = await screen.findByTestId('passphrase-prompt');
    type('Passphrase', 'not the passphrase');
    fireEvent.click(within(prompt).getByRole('button', { name: 'Open backup' }));
    const alert = await within(prompt).findByRole('alert');
    expect(alert.textContent).toBe(CANNOT_OPEN);
    expect((within(prompt).getByLabelText('Passphrase') as HTMLInputElement).value).toBe('');
    expect(screen.queryByTestId('import-preview')).toBeNull();
    const after = await readDb();
    for (const t of Object.keys(before)) expect(diffTable(t, keys()[t]!, before[t]!, after[t]!)).toEqual([]);
  });

  it('a file with one changed byte says exactly the same thing as a wrong passphrase', async () => {
    const { text } = await encryptedFileOf(false);
    const file = JSON.parse(text);
    file.data = `${file.data[0] === 'A' ? 'B' : 'A'}${file.data.slice(1)}`;
    await resetDbForTesting();
    await settingsRepo.setFlag('taskInbox', true);
    await mountEnhanced();
    await chooseText(JSON.stringify(file));
    const prompt = await screen.findByTestId('passphrase-prompt');
    type('Passphrase', PASS);
    fireEvent.click(within(prompt).getByRole('button', { name: 'Open backup' }));
    expect((await within(prompt).findByRole('alert')).textContent).toBe(CANNOT_OPEN);
  });

  it('the right passphrase opens the preview; the wave\'s own sentence holds, secrets included when they were ticked', async () => {
    const { data, text } = await encryptedFileOf(true);
    await resetDbForTesting();
    await settingsRepo.setFlag('taskInbox', true);
    await mountEnhanced();
    await chooseText(text);
    const prompt = await screen.findByTestId('passphrase-prompt');
    type('Passphrase', PASS);
    fireEvent.click(within(prompt).getByRole('button', { name: 'Open backup' }));
    const preview = await screen.findByTestId('import-preview');
    await waitFor(() => expect(within(preview).queryByText('Looking at what is on this device…')).toBeNull());
    expect(screen.queryByTestId('passphrase-prompt')).toBeNull();
    // The file says what it holds, including that it includes the secrets (and no longer says it leaves them out).
    expect(within(preview).getByText(/This file also holds \d+ API keys?, your Google Calendar sign-in and your private calendar link: replacing restores them on this device\./)).toBeTruthy();
    expect(within(preview).getByText(/in this file are not added by this option; replacing brings them across\./)).toBeTruthy();
    expect(preview.textContent).not.toMatch(/does not include your API keys/);

    fireEvent.click(within(preview).getByRole('radio', { name: 'Replace everything on this device' }));
    fireEvent.click(within(preview).getByRole('button', { name: 'Replace everything…' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Replace everything' }));
    expect((await screen.findByTestId('backup-outcome')).textContent).toMatch(/^Restored /);

    const after = await readDb();
    expect((after.tokens![0] as { accessToken: string }).accessToken).toBe(SECRET.accessToken);
    expect(after.settings![0]!.icsSubscriptionUrl).toBe(SECRET.icsUrl);
    expect(diffTable('tasks', 'id', data.tasks!, after.tasks!)).toEqual([]);
    const llm = after.llmSettings![0] as { providers: Record<string, { apiKey: string }> };
    expect(llm.providers['planted-browser']!.apiKey).toBe(SECRET.apiKey('planted-browser'));
  });

  it('an unticked file restores no secret and says the device\'s stay', async () => {
    const { text } = await encryptedFileOf(false);
    await resetDbForTesting();
    await settingsRepo.setFlag('taskInbox', true);
    await mountEnhanced();
    await chooseText(text);
    const prompt = await screen.findByTestId('passphrase-prompt');
    type('Passphrase', PASS);
    fireEvent.click(within(prompt).getByRole('button', { name: 'Open backup' }));
    const preview = await screen.findByTestId('import-preview');
    await waitFor(() => expect(within(preview).queryByText('Looking at what is on this device…')).toBeNull());
    expect(within(preview).getByText(/Your API keys, Google Calendar sign-in and private calendar link stay on this device\./)).toBeTruthy();
    expect(within(preview).getByText(/This backup does not include your API keys/)).toBeTruthy();
  });

  it('controls are named by their visible text and the targets are large', async () => {
    const { text } = await encryptedFileOf(false);
    await mountEnhanced();
    fireEvent.click(screen.getByRole('button', { name: 'Export encrypted…' }));
    const form = await screen.findByTestId('encrypted-export');
    for (const b of within(form).getAllByRole('button')) expect(b.className).toMatch(/min-h-11/);
    for (const i of within(form).getAllByLabelText(/Passphrase|Type it again/)) expect((i as HTMLElement).className).toMatch(/min-h-11/);
    expect(within(form).getByRole('checkbox').closest('label')!.className).toMatch(/min-h-11/);
    void text;
    void MIN_ITERATIONS;
  });
});


describe('the box says what it would include, by count', () => {
  it('lists the secrets on this device with their counts, changes its sentence when ticked, and is off each time', async () => {
    const data = await deviceWithSecrets(403);
    const llm = data.llmSettings![0]! as { providers: Record<string, { apiKey: string; credentialSource?: string }> };
    const keyCount = Object.values(llm.providers).filter((p) => p.credentialSource !== 'environment' && p.apiKey).length;
    await mountEnhanced();
    fireEvent.click(screen.getByRole('button', { name: 'Export encrypted…' }));
    const inventory = await screen.findByTestId('secrets-inventory');
    await waitFor(() => expect(inventory.textContent).toMatch(/^On this device:/));
    expect(inventory.textContent).toContain(`On this device: API keys (${keyCount}), Google Calendar sign-in (1), Private calendar link (1).`);
    expect(inventory.textContent).toContain('They stay out of the file unless you tick this.');
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    expect(box.getAttribute('aria-describedby')).toBe(inventory.id);
    fireEvent.click(box);
    expect(inventory.textContent).toContain('These will be inside the file.');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export encrypted…' }));
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('says there is nothing to include when there is nothing', async () => {
    await mountEnhanced();
    fireEvent.click(screen.getByRole('button', { name: 'Export encrypted…' }));
    const inventory = await screen.findByTestId('secrets-inventory');
    await waitFor(() => expect(inventory.textContent).toContain('There are none of these on this device, so there is nothing to include.'));
  });
});

describe('every way a file can fail to open is the same sentence', () => {
  async function promptFor(text: string) {
    await mountEnhanced();
    await chooseText(text);
    return screen.findByTestId('passphrase-prompt');
  }

  it('wrong passphrase, one changed byte, a truncated file, a header that is not ours, rounds out of range: all CANNOT_OPEN, none opens a preview', async () => {
    await deviceWithSecrets(404);
    await mountEnhanced();
    const good = (await saveEncrypted(PASS, false)).text;
    cleanup();
    const file = JSON.parse(good);
    const flipped = { ...file, data: `${file.data[0] === 'A' ? 'B' : 'A'}${file.data.slice(1)}` };
    const cases: [string, string, string][] = [
      ['wrong passphrase', good, 'not the passphrase'],
      ['one changed byte', JSON.stringify(flipped), PASS],
      ['truncated in the middle', good.slice(0, Math.floor(good.length / 2)), PASS],
      ['truncated just before the end', good.slice(0, -3), PASS],
      ['an extra header field', JSON.stringify({ ...file, extra: 1 }), PASS],
      ['a missing header field', JSON.stringify({ format: file.format, version: file.version, kdf: file.kdf, data: file.data }), PASS],
      ['rounds out of range', JSON.stringify({ ...file, kdf: { ...file.kdf, iterations: 5 } }), PASS],
    ];
    for (const [name, text, pass] of cases) {
      await resetDbForTesting();
      await settingsRepo.setFlag('taskInbox', true);
      const prompt = await promptFor(text);
      type('Passphrase', pass);
      fireEvent.click(within(prompt).getByRole('button', { name: 'Open backup' }));
      expect((await within(prompt).findByRole('alert')).textContent, name).toBe(CANNOT_OPEN);
      expect(screen.queryByTestId('import-preview'), name).toBeNull();
      cleanup();
    }
  });

  it('the prompt says plainly that a forgotten passphrase cannot be recovered, and is not a login field', async () => {
    await deviceWithSecrets(405);
    await mountEnhanced();
    const good = (await saveEncrypted(PASS, false)).text;
    cleanup();
    const prompt = await promptFor(good);
    expect(within(prompt).getByText('A forgotten passphrase cannot be recovered. There is no reset.')).toBeTruthy();
    const field = within(prompt).getByLabelText('Passphrase') as HTMLInputElement;
    expect(field.type).toBe('password');
    expect(field.getAttribute('autocomplete')).toBe('off');
  });
});

describe('the passphrase is nowhere but the field', () => {
  it('is in no storage, no database table, no URL and no console line after saving and after opening', async () => {
    const SECRET_PASS = 'PASSPHRASE-STORAGE-CHECK-5e1';
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const writes: string[] = [];
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { writes.push(`${k}=${v}`); });
    await deviceWithSecrets(406);
    await mountEnhanced();
    const call = await saveEncrypted(SECRET_PASS, true);
    cleanup();
    await resetDbForTesting();
    await settingsRepo.setFlag('taskInbox', true);
    await mountEnhanced();
    await chooseText(call.text);
    const prompt = await screen.findByTestId('passphrase-prompt');
    type('Passphrase', SECRET_PASS);
    fireEvent.click(within(prompt).getByRole('button', { name: 'Open backup' }));
    await screen.findByTestId('import-preview');

    expect(JSON.stringify(writes)).not.toContain('STORAGE-CHECK');
    expect(JSON.stringify({ ...localStorage })).not.toContain('STORAGE-CHECK');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('STORAGE-CHECK');
    expect(JSON.stringify(await readDb())).not.toContain('STORAGE-CHECK');
    expect(window.location.href).not.toContain('STORAGE-CHECK');
    expect(document.body.innerHTML).not.toContain('STORAGE-CHECK');
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain('STORAGE-CHECK');
    setItem.mockRestore();
  });
});
