'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSettings } from '@/hooks/useSettings';
import { getDb } from '@/lib/db/db';

export function ClearDataSettings() {
  const { settings, updateSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

  async function wipe(): Promise<void> {
    setWiping(true);
    try {
      await getDb().delete();
    } finally {
      window.location.reload();
    }
  }

  function handleClick() {
    if (settings?.confirmClearData === false) {
      void wipe();
    } else {
      setOpen(true);
    }
  }

  async function handleConfirm(dontAskAgain: boolean) {
    if (dontAskAgain) await updateSettings({ confirmClearData: false });
    setOpen(false);
    await wipe();
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
        Data
      </div>
      <Button variant="danger" onClick={handleClick} disabled={wiping}>
        {wiping ? 'Wiping…' : 'Clear all data'}
      </Button>
      <p className="text-text-muted text-xs mt-2">
        Wipes IndexedDB and reloads. Cannot be undone.
      </p>
      <ConfirmDialog
        open={open}
        title="Clear all data?"
        message="Every session, kata, conversation, and setting will be permanently deleted."
        confirmLabel="Wipe everything"
        showDontAskAgain
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </Card>
  );
}