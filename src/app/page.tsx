'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StreakFlame } from '@/components/streak/StreakFlame';
import { TabBar } from '@/components/ui/TabBar';
import { FAB } from '@/components/ui/FAB';
import { useSettings } from '@/hooks/useSettings';
import { streakRepo } from '@/lib/db/streak.repo';

export default function HomePage() {
  const router = useRouter();
  const { settings } = useSettings();
  const { data: streak } = useQuery({
    queryKey: ['streak'],
    queryFn: () => streakRepo.get(),
  });
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    const done = localStorage.getItem('onboarding-completed');
    if (done !== 'true') {
      router.replace('/onboarding');
    } else {
      setOnboardingDone(true);
    }
  }, [router]);

  if (onboardingDone === null) {
    return null; // loading
  }

  const name = settings?.displayName;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-dvh pb-20">
      <div className="max-w-md mx-auto px-4 py-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="font-serif text-2xl text-text mb-1">
            {greeting}{name ? `, ${name}` : ''}.
          </h1>
          <p className="text-text-muted text-sm mb-6">
            No sessions yet. The first step is the whole path.
          </p>

          <div className="mb-6">
            <StreakFlame days={streak?.currentStreakDays ?? 0} />
          </div>

          <Card className="text-center py-12">
            <div className="text-text-muted text-sm mb-4">
              Your practice log is empty.
            </div>
            <Button>Start your first session</Button>
          </Card>
        </motion.div>
      </div>
      <FAB onClick={() => console.log('FAB tapped')} />
      <TabBar />
    </div>
  );
}
