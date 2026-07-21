'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useSessions } from '@/hooks/useSessions';
import { useStreak } from '@/hooks/useStreak';
import { TodaySummary } from '@/components/dashboard/TodaySummary';
import { WeekChart } from '@/components/dashboard/WeekChart';
import { StreakFlame } from '@/components/streak/StreakFlame';
import { SessionForm } from '@/components/session/SessionForm';
import { SessionCard } from '@/components/session/SessionCard';
import { toLocalDateString } from '@/lib/utils/date';
import type { SessionInput } from '@/lib/schemas/session';

export default function HomePage() {
  const router = useRouter();
  const { sessions, createSession } = useSessions();
  const { streak } = useStreak();
  const [formOpen, setFormOpen] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    const done = localStorage.getItem('onboarding-completed');
    if (done !== 'true') {
      router.replace('/onboarding');
    } else {
      setOnboardingDone(true);
    }
  }, [router]);

  if (onboardingDone === null) return null;

  const today = toLocalDateString(new Date());
  const todaySessions = sessions.filter(
    (s) => toLocalDateString(s.startedAt) === today
  );
  const last7 = sessions.filter((s) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return s.startedAt >= sevenDaysAgo;
  });
  const recent = sessions.slice(0, 3);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  async function handleSave(input: SessionInput) {
    await createSession(input);
    setFormOpen(false);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <h1 className="font-serif text-2xl text-text mb-1">{greeting}.</h1>
      <p className="text-text-muted text-sm mb-6">
        {sessions.length === 0
          ? 'No sessions yet. The first step is the whole path.'
          : `${todaySessions.length} session${todaySessions.length === 1 ? '' : 's'} today.`}
      </p>

      <div className="mb-4">
        <StreakFlame days={streak?.currentStreakDays ?? 0} />
      </div>

      {todaySessions.length > 0 && (
        <div className="mb-4">
          <TodaySummary sessions={todaySessions} />
        </div>
      )}

      <div className="mb-6">
        <div className="text-xs uppercase tracking-wide text-text-muted mb-2">This week</div>
        <WeekChart sessions={last7} />
      </div>

      {recent.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wide text-text-muted">Recent</div>
            <Link href="/sessions" className="text-xs text-accent">View all</Link>
          </div>
          <div className="divide-y divide-border">
            {recent.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="text-center py-8">
          <button
            onClick={() => setFormOpen(true)}
            className="bg-accent text-base px-6 py-3 rounded-full font-medium"
          >
            Start your first session
          </button>
        </div>
      )}

      <SessionForm
        open={formOpen}
        onSave={handleSave}
        onCancel={() => setFormOpen(false)}
      />
    </motion.div>
  );
}
