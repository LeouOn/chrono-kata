'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useNotificationReminder } from '@/hooks/useNotificationReminder';
import { parseTimeString, formatTimeString } from '@/lib/notifications/reminder';

export function ReminderSettings() {
  const {
    permission,
    requestPermission,
    setReminderTime,
    reminderTime,
    enabled,
  } = useNotificationReminder();

  const [pendingTime, setPendingTime] = useState<string>(reminderTime ?? '20:30');

  async function enable() {
    const result = await requestPermission();
    if (result === 'granted') {
      const parsed = parseTimeString(pendingTime);
      if (parsed) {
        await setReminderTime(formatTimeString(parsed));
      }
    }
  }

  async function updateTime(newTime: string) {
    setPendingTime(newTime);
    if (enabled) {
      const parsed = parseTimeString(newTime);
      if (parsed) await setReminderTime(formatTimeString(parsed));
    }
  }

  async function disable() {
    await setReminderTime(null);
  }

  if (permission === 'unsupported') {
    return (
      <Card>
        <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
          Daily Reminder
        </div>
        <p className="text-text-muted text-sm">Notifications not supported in this browser.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
        Daily Reminder
      </div>

      {!enabled || permission !== 'granted' ? (
        <>
          <p className="text-text-muted text-sm mb-3">
            Get a gentle daily nudge if you haven't logged a session. Notifications fire while the app is open in a tab.
          </p>
          {permission === 'denied' ? (
            <p className="text-hype text-sm">
              Notifications are blocked in your browser settings. Enable them to use reminders.
            </p>
          ) : (
            <div className="flex gap-2 items-center">
              <label className="flex items-center gap-2 text-sm text-text-muted">
                Time
                <input
                  type="time"
                  value={pendingTime}
                  onChange={(e) => updateTime(e.target.value)}
                  className="bg-surface-2 border border-border rounded-2xl px-3 py-1.5 text-text"
                />
              </label>
              <Button onClick={enable}>Enable reminder</Button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <span className="text-text-muted text-sm">Time</span>
            <input
              type="time"
              value={reminderTime ?? ''}
              onChange={(e) => updateTime(e.target.value)}
              className="bg-surface-2 border border-border rounded-2xl px-3 py-1.5 text-text"
            />
          </label>
          <div>
            <Button variant="ghost" onClick={disable}>Disable reminder</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
