'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CalendarStatus } from './CalendarStatus';
import { useCalendar } from '@/hooks/useCalendar';
import { isCalendarEnabled } from '@/lib/env';

export function CalendarSettings() {
  const { settings, isConnected, isConnecting, connect, disconnect, toggleSync } = useCalendar();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [alsoDelete, setAlsoDelete] = useState(false);

  if (!isCalendarEnabled()) {
    return (
      <Card>
        <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
          Google Calendar
        </div>
        <p className="text-text-muted text-sm">
          Calendar export is disabled. Set <code>NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID</code> in your environment to enable.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wide text-text-muted">
          Google Calendar
        </div>
        <CalendarStatus settings={settings} />
      </div>

      {!isConnected ? (
        <>
          <p className="text-text-muted text-sm mb-3">
            Connect to push timed sessions to a dedicated <code>chrono-kata</code> calendar. Reps-only sessions are not exported.
          </p>
          <Button onClick={() => connect()} disabled={isConnecting}>
            {isConnecting ? 'Connecting…' : 'Connect Google Calendar'}
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.googleCalendarSyncEnabled ?? false}
              onChange={(e) => toggleSync(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            <span className="text-sm text-text">Sync new sessions automatically</span>
          </label>
          <div>
            <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
              Disconnect
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Disconnect Google Calendar?"
        message={
          isConnected
            ? 'Clears tokens and pauses sync. Your chrono-kata calendar and past events remain untouched unless you opt in below.'
            : ''
        }
        confirmLabel="Disconnect"
        onConfirm={() => {
          void disconnect({ alsoDeleteCalendar: alsoDelete });
          setConfirmOpen(false);
          setAlsoDelete(false);
        }}
        onCancel={() => {
          setConfirmOpen(false);
          setAlsoDelete(false);
        }}
      >
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={alsoDelete}
            onChange={(e) => setAlsoDelete(e.target.checked)}
            className="accent-[var(--color-hype)]"
          />
          <span className="text-sm text-hype">
            Also delete the chrono-kata calendar (irreversible)
          </span>
        </label>
      </ConfirmDialog>
    </Card>
  );
}
