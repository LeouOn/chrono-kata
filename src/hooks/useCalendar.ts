'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsRepo } from '@/lib/db/settings.repo';
import { tokensRepo } from '@/lib/db/tokens.repo';
import { requestCalendarTokens } from '@/lib/calendar/gis';
import { createChronoKataCalendar, deleteCalendar } from '@/lib/calendar/client';
import { flushPendingOps } from '@/lib/calendar/sync';
import { dispatchToast } from '@/components/ui/Toast';

const KEY = ['settings'] as const;

export function useCalendar() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({ queryKey: KEY, queryFn: () => settingsRepo.get() });

  const connect = useMutation({
    mutationFn: async () => {
      const tokens = await requestCalendarTokens();
      await tokensRepo.save({
        id: 'google',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      });
      const calendarId = await createChronoKataCalendar();
      return settingsRepo.patch({
        googleCalendarId: calendarId,
        googleCalendarSyncEnabled: true,
        googleCalendarConnectedAt: new Date(),
      });
    },
    onSuccess: (updated) => {
      qc.setQueryData(KEY, updated);
      dispatchToast('Google Calendar connected.', 'success');
    },
    onError: (err) => {
      dispatchToast(
        err instanceof Error ? err.message : 'Calendar connect failed.',
        'error',
      );
    },
  });

  const disconnect = useMutation({
    mutationFn: async ({ alsoDeleteCalendar }: { alsoDeleteCalendar: boolean }) => {
      const current = await settingsRepo.get();
      await tokensRepo.clear();
      if (alsoDeleteCalendar && current.googleCalendarId) {
        await deleteCalendar(current.googleCalendarId);
      }
      return settingsRepo.patch({
        googleCalendarSyncEnabled: false,
        googleCalendarConnectedAt: null,
        // Keep calendarId for potential reconnect unless wiping
        ...(alsoDeleteCalendar ? { googleCalendarId: null } : {}),
      });
    },
    onSuccess: (updated, vars) => {
      qc.setQueryData(KEY, updated);
      dispatchToast(
        vars.alsoDeleteCalendar
          ? 'Calendar disconnected and removed.'
          : 'Calendar disconnected.',
        'success',
      );
    },
    onError: (err) => {
      dispatchToast(
        err instanceof Error ? err.message : 'Calendar disconnect failed.',
        'error',
      );
    },
  });

  const toggleSync = useMutation({
    mutationFn: async (enabled: boolean) =>
      settingsRepo.patch({ googleCalendarSyncEnabled: enabled }),
    onSuccess: (updated) => qc.setQueryData(KEY, updated),
  });

  const flushPending = useMutation({
    mutationFn: async () => {
      await flushPendingOps();
    },
  });

  return {
    settings: settingsQuery.data,
    isConnected: !!settingsQuery.data?.googleCalendarConnectedAt,
    isConnecting: connect.isPending,
    connect: connect.mutateAsync,
    disconnect: disconnect.mutateAsync,
    toggleSync: toggleSync.mutateAsync,
    flushPending: flushPending.mutateAsync,
  };
}
