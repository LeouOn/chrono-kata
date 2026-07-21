'use client';

import { useNotificationReminderEffect } from '@/hooks/useNotificationReminder';

/**
 * Side-effect-only component. Mounts the notification hook's interval
 * + focus listener at the layout level so the reminder fires regardless
 * of which tab the user is on. Renders nothing.
 *
 * The settings page calls `useNotificationReminderState` separately for its
 * UI state (permission, reminder time). Dedup is module-level so even
 * multiple mount attempts can't double-fire.
 */
export function NotificationRunner() {
  useNotificationReminderEffect();
  return null;
}