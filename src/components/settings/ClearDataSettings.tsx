'use client';

import { useState } from 'react';
import Dexie from 'dexie';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useFlag } from '@/hooks/useFlags';
import { useSettings } from '@/hooks/useSettings';
import { getDb } from '@/lib/db/db';
import { deleteAllCopies } from '@/lib/copies/copies-db';

export function ClearDataSettings() {
  const { settings } = useSettings();
  const copiesOn = useFlag('taskInbox');
  const [open, setOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

  async function wipe(): Promise<void> {
    setWiping(true);
    try {
      getDb().close();
      await Dexie.delete('chrono-kata');
      // The automatic copies hold the same data. "Clear all data" that left them behind would not be.
      await deleteAllCopies();
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

  function handleConfirm() {
    setOpen(false);
    void wipe();
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
        {copiesOn ? 'Wipes IndexedDB, including the automatic copies on this device, and reloads. Cannot be undone.' : 'Wipes IndexedDB and reloads. Cannot be undone.'}
      </p>
      <ConfirmDialog
        open={open}
        title="Clear all data?"
        message="Every session, kata, check-in, conversation, and setting will be permanently deleted."
        confirmLabel="Wipe everything"
        onConfirm={() => void handleConfirm()}
        onCancel={() => setOpen(false)}
      />
    </Card>
  );
}
