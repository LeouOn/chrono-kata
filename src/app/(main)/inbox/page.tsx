'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFlag } from '@/hooks/useFlags';
import { useSettings } from '@/hooks/useSettings';
import { InboxScreen } from '@/components/tasks/InboxScreen';

/**
 * `/inbox` exists only behind the `taskInbox` flag. With the flag off (the
 * default) the route sends the user home and renders nothing new.
 */
export default function InboxPage() {
  const router = useRouter();
  const enabled = useFlag('taskInbox');
  const { settings } = useSettings();

  useEffect(() => {
    if (settings && !enabled) router.replace('/');
  }, [settings, enabled, router]);

  if (!settings || !enabled) return null;
  return <InboxScreen />;
}
