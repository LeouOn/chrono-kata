'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFlag } from '@/hooks/useFlags';
import { useSettings } from '@/hooks/useSettings';
import { ProjectDetail } from '@/components/projects/ProjectDetail';

/** Behind the `taskInbox` flag like every task screen; flag off sends the user home. */
export function ProjectDetailClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const enabled = useFlag('taskInbox');
  const { settings } = useSettings();

  useEffect(() => {
    if (settings && !enabled) router.replace('/');
  }, [settings, enabled, router]);

  if (!settings || !enabled) return null;
  return <ProjectDetail projectId={searchParams.get('id')} />;
}
