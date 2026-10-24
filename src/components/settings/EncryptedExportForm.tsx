'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { countSecrets, describeSecrets, encryptBackup, MIN_PASSPHRASE_CHARS, withoutIncludedSecrets, type BackupSecrets } from '@/lib/data-transfer/encrypted';
import { collectAll, collectSecrets, downloadText } from '@/lib/data-transfer/export';
import { toLocalDateString } from '@/lib/utils/date';

interface Props {
  /** Told what was saved, in a sentence. */
  onSaved: (message: string) => void;
  onCancel: () => void;
}

/**
 * Save an encrypted backup (roadmap Wave 18 part 3, behind `taskInbox`).
 *
 * The secrets box is OFF every time and never remembered. A plain backup never holds an API key, a
 * Google sign-in or the private calendar link; an encrypted one holds them only if this box is ticked.
 */
export function EncryptedExportForm({ onSaved, onCancel }: Props) {
  const headingId = useId();
  const passId = useId();
  const againId = useId();
  const boxId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const [passphrase, setPassphrase] = useState('');
  const [again, setAgain] = useState('');
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [onDevice, setOnDevice] = useState<BackupSecrets | null>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  // What the box WOULD put in the file, by count, read when the form opens (reading changes nothing).
  useEffect(() => {
    let live = true;
    void collectSecrets().then((found) => {
      if (live) setOnDevice(found);
    });
    return () => {
      live = false;
    };
  }, []);
  const counts = onDevice ? countSecrets(onDevice) : null;
  const inventory = counts
    ? [
        ...(counts.apiKeys > 0 ? [`API keys (${counts.apiKeys})`] : []),
        ...(counts.googleSignIn > 0 ? [`Google Calendar sign-in (${counts.googleSignIn})`] : []),
        ...(counts.calendarLink > 0 ? [`Private calendar link (${counts.calendarLink})`] : []),
      ]
    : [];

  const longEnough = [...passphrase.normalize('NFKC')].length >= MIN_PASSPHRASE_CHARS;
  const matches = passphrase === again;
  const ready = longEnough && matches && !busy;

  async function save() {
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      const envelope = await collectAll();
      const secrets = includeSecrets ? await collectSecrets() : null;
      const carried = secrets && (Object.keys(secrets.llmApiKeys).length > 0 || secrets.googleToken || secrets.icsSubscriptionUrl) ? secrets : null;
      const made = await encryptBackup({ ...envelope, leftOut: withoutIncludedSecrets(envelope.leftOut, carried) }, passphrase, { secrets: carried });
      if (!made.ok) {
        setProblem(made.message);
        return;
      }
      downloadText(made.text, `chrono-kata-backup-${toLocalDateString(new Date())}.encrypted.json`);
      const inside = carried ? ` Also inside it: ${describeSecrets(carried)}.` : ' Your API keys, Google Calendar sign-in and private calendar link are not in it.';
      setPassphrase('');
      setAgain('');
      onSaved(`Saved an encrypted backup of ${envelope.sessions.length} session${envelope.sessions.length === 1 ? '' : 's'} and the rest of your data.${inside}`);
    } catch {
      setProblem('The encrypted backup could not be made, so no file was saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={headingId} className="mt-4 space-y-3 rounded-2xl border border-border p-3" data-testid="encrypted-export">
      <h3 id={headingId} className="text-base font-medium text-text">
        Save an encrypted backup
      </h3>
      <p className="text-sm text-text-muted">
        The file can only be opened with the passphrase you choose. The passphrase is not saved anywhere, so a forgotten passphrase cannot be
        recovered: nobody can open the file without it, and there is no reset.
      </p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="space-y-1">
          <label htmlFor={passId} className="block text-sm text-text">
            Passphrase
          </label>
          <input
            id={passId}
            ref={firstRef}
            type="password"
            autoComplete="new-password"
            className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
          <p className="text-xs text-text-muted">At least {MIN_PASSPHRASE_CHARS} characters. A few words you will remember is fine.</p>
        </div>
        <div className="space-y-1">
          <label htmlFor={againId} className="block text-sm text-text">
            Type it again
          </label>
          <input
            id={againId}
            type="password"
            autoComplete="new-password"
            className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
          />
          {again !== '' && !matches && (
            <p role="status" className="text-xs text-text-muted">
              The two do not match yet.
            </p>
          )}
        </div>
        <div>
          <label htmlFor={boxId} className="flex min-h-11 items-start gap-3 text-sm text-text">
            <input
              id={boxId}
              type="checkbox"
              className="mt-1 size-5 shrink-0"
              aria-describedby={`${boxId}-what`}
              checked={includeSecrets}
              onChange={(event) => setIncludeSecrets(event.target.checked)}
            />
            Also include my API keys, Google sign-in and private calendar link in this encrypted file
          </label>
          <p id={`${boxId}-what`} className="ml-8 text-xs text-text-muted" data-testid="secrets-inventory">
            {onDevice === null
              ? 'Looking at what is on this device…'
              : inventory.length > 0
                ? `On this device: ${inventory.join(', ')}.${includeSecrets ? ' These will be inside the file.' : ' They stay out of the file unless you tick this.'}`
                : 'There are none of these on this device, so there is nothing to include.'}{' '}
            Ticked, anyone who has both this file and the passphrase can use them.
          </p>
        </div>
        {problem && (
          <p role="alert" className="text-sm text-text">
            {problem}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-11" disabled={!ready}>
            {busy ? 'Encrypting…' : 'Save encrypted file'}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={onCancel}>
            Not now
          </Button>
        </div>
      </form>
    </section>
  );
}
