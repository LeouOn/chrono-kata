'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFlag } from '@/hooks/useFlags';
import { useSettings } from '@/hooks/useSettings';
import { ProjectsScreen } from '@/components/projects/ProjectsScreen';

/**
 * `/projects` exists only behind the `taskInbox` flag. With the flag off (the
 * default) the route sends the user home and reads nothing.
 */
export default function ProjectsPage() {
  const router = useRouter();
  const enabled = useFlag('taskInbox');
  const { settings } = useSettings();

  useEffect(() => {
    if (settings && !enabled) router.replace('/');
  }, [settings, enabled, router]);

  if (!settings || !enabled) return null;
  return <ProjectsScreen />;
}
