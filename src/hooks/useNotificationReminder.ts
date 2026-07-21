'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { settingsRepo } from '@/lib/db/settings.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { useSettings } from '@/hooks/useSettings';
import { shouldFireReminder, getLastLogDate } from '@/lib/notifications/reminder';

type Permission = 'default' | 'granted' | 'denied' | 'unsupported';

/**
 * Module-level dedup state. Shared across ALL hook mounts so that even if
 * `useNotificationReminderEffect` is somehow called more than once, only
 * one notification fires per (date, time) slot.
 */
let lastFiredSlot: string | null = null;

/**
 * STATE hook — consumed by the Settings page UI. Returns permission,
 * current reminder settings, and the actions to mutate them.
 *
 * Does NOT register an interval or focus listener.
 */
export function useNotificationReminderState() {
  const qc = useQueryClient();
  const { settings, updateSettings } = useSettings();
  const [permission, setPermission] = useState<Permission>('default');

  // Initialize permission state on mount.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setPermission('unsupported');
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      await updateSettings({ notificationsEnabled: true });
    }
    return result;
  }, [updateSettings]);

  const setReminderTime = useCallback(async (time: string | null) => {
    await updateSettings({ reminderTime: time });
    qc.invalidateQueries({ queryKey: ['settings'] });
  }, [updateSettings, qc]);

  return {
    permission,
    requestPermission,
    setReminderTime,
    reminderTime: settings?.reminderTime ?? null,
    enabled: settings?.notificationsEnabled ?? false,
  };
}

/**
 * EFFECT hook — consumed by `<NotificationRunner />` mounted in the (main) layout.
 * Owns the interval + focus listener that fires `Notification` when the
 * configured reminder time arrives and no session was logged today.
 *
 * Module-level `lastFiredSlot` dedupes across mounts. Safe to mount only once;
 * mounting multiple times is harmless (both would compute the same slot key).
 */
export function useNotificationReminderEffect() {
  const { settings } = useSettings();
  const [permission, setPermission] = useState<Permission>('default');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    async function check() {
      if (cancelled) return;
      if (!settings) return;
      if (permission !== 'granted') return;
      if (!settings.notificationsEnabled || !settings.reminderTime) return;

      const sessions = await sessionRepo.getAll();
      const lastDate = getLastLogDate(sessions, new Date());
      const now = new Date();

      if (shouldFireReminder({
        reminderTime: settings.reminderTime,
        notificationsEnabled: settings.notificationsEnabled,
        lastSessionDate: lastDate,
        now,
      })) {
        // Module-level dedup: same slot key means "already fired in this window".
        const slotKey = `${toLocalDateKey(now)} ${settings.reminderTime}`;
        if (lastFiredSlot === slotKey) return;
        lastFiredSlot = slotKey;

        new Notification('chrono-kata', {
          body: 'A small practice tonight — it counts.',
          icon: '/icons/192.png',
          tag: 'chrono-kata-reminder',
        });
      }
    }

    void check();
    const intervalId = setInterval(check, 60_000);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [settings, permission]);
}

function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}