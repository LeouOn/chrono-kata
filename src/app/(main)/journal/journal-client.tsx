'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFlag } from '@/hooks/useFlags';
import { useSettings } from '@/hooks/useSettings';
import { JournalScreen } from '@/components/journal/JournalScreen';

/**
 * `/journal` exists only behind the `taskInbox` flag (like `/inbox`). With the
 * flag off the route sends the user home and renders nothing new.
 */
export function JournalPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const enabled = useFlag('taskInbox');
  const { settings } = useSettings();

  useEffect(() => {
    if (settings && !enabled) router.replace('/');
  }, [settings, enabled, router]);

  if (!settings || !enabled) return null;
  return <JournalScreen dateParam={searchParams.get('date')} />;
}
