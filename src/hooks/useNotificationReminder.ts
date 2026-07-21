'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { settingsRepo } from '@/lib/db/settings.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { useSettings } from '@/hooks/useSettings';
import { shouldFireReminder, getLastLogDate } from '@/lib/notifications/reminder';

type Permission = 'default' | 'granted' | 'denied' | 'unsupported';

export function useNotificationReminder() {
  const qc = useQueryClient();
  const { settings, updateSettings } = useSettings();
  const [permission, setPermission] = useState<Permission>('default');
  const lastFiredKeyRef = useRef<string | null>(null);

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

  // Check on tab focus + every 60s while open.
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
        // Don't fire twice in the same (HH:MM) slot.
        const slotKey = `${toLocalDateKey(now)} ${settings.reminderTime}`;
        if (lastFiredKeyRef.current === slotKey) return;
        lastFiredKeyRef.current = slotKey;

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

function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
