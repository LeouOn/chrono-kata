'use client';

import { useNotificationReminder } from '@/hooks/useNotificationReminder';

/**
 * Side-effect-only component. Mounts the notification hook's interval
 * + focus listener at the layout level so the reminder fires regardless
 * of which tab the user is on. Renders nothing.
 *
 * The settings page also calls useNotificationReminder for its UI state;
 * React Query dedupes the state via useSettings, and the second interval
 * is harmless because slot-key dedup is symmetric across both mounts.
 */
export function NotificationRunner() {
  useNotificationReminder();
  return null;
}