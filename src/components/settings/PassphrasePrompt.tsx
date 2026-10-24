'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

interface Props {
  /** Resolves with a message when the file did not open; the prompt stays for another try. */
  onOpen: (passphrase: string) => Promise<string | null>;
  onCancel: () => void;
}

/** Asks for the passphrase of an encrypted backup. The passphrase lives only in this field. */
export function PassphrasePrompt({ onOpen, onCancel }: Props) {
  const inputId = useId();
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit() {
    if (busy || passphrase === '') return;
    setBusy(true);
    setProblem(null);
    const message = await onOpen(passphrase);
    setBusy(false);
    if (message) {
      setProblem(message);
      setPassphrase('');
      inputRef.current?.focus();
    }
  }

  return (
    <section aria-labelledby={headingId} className="mt-4 space-y-3 rounded-2xl border border-border p-3" data-testid="passphrase-prompt">
      <h3 id={headingId} className="text-base font-medium text-text">
        This backup is encrypted
      </h3>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-1">
          <label htmlFor={inputId} className="block text-sm text-text">
            Passphrase
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
        </div>
        {problem && (
          <p role="alert" className="text-sm text-text">
            {problem}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-11" disabled={busy || passphrase === ''}>
            {busy ? 'Opening…' : 'Open backup'}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={onCancel}>
            Not now
          </Button>
        </div>
      </form>
    </section>
  );
}
