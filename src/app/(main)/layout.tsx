'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TabBar } from '@/components/ui/TabBar';
import { FAB } from '@/components/ui/FAB';
import { SessionForm } from '@/components/session/SessionForm';
import { MilestoneCelebration } from '@/components/streak/MilestoneCelebration';
import { NotificationRunner } from '@/components/system/NotificationRunner';
import { useSessions, recomputeStreakSideEffect } from '@/hooks/useSessions';
import { flushPendingOps } from '@/lib/calendar/sync';
import { toLocalDateString } from '@/lib/utils/date';
import { readSessionTimer } from '@/lib/timers/session-timer';

export default function MainLayout({ children }: { children: ReactNode }) {
  const [fabOpen, setFabOpen] = useState(false);
  const { createSession } = useSessions();
  const qc = useQueryClient();

  const refreshStreak = useCallback(async () => {
    await recomputeStreakSideEffect();
    qc.invalidateQueries({ queryKey: ['streak'] });
  }, [qc]);

  useEffect(() => {
    void refreshStreak();
    void flushPendingOps();
    if (readSessionTimer()) setFabOpen(true);
  }, [refreshStreak]);

  // Refresh the streak when the local day rolls over while the app is open,
  // or when the user returns to the app after the day changed.
  useEffect(() => {
    let lastDay = toLocalDateString(new Date());
    const maybeRefresh = () => {
      const today = toLocalDateString(new Date());
      if (today === lastDay) return;
      lastDay = today;
      void refreshStreak();
    };
    const intervalId = setInterval(maybeRefresh, 60_000);
    const onWake = () => {
      if (document.visibilityState === 'visible') maybeRefresh();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [refreshStreak]);

  return (
    <div className="min-h-dvh pb-20">
      <div className="max-w-md mx-auto px-4 py-6">{children}</div>
      <FAB onClick={() => setFabOpen(true)} />
      <TabBar />
      <SessionForm
        open={fabOpen}
        onSave={async (input) => {
          await createSession(input);
          setFabOpen(false);
        }}
        onCancel={() => setFabOpen(false)}
      />
      <MilestoneCelebration />
      <NotificationRunner />
    </div>
  );
}
