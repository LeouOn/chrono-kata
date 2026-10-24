'use client';

import { TimelineScreen } from '@/components/timeline/TimelineScreen';

/** Static route (no dynamic segment) so the NEXT_EXPORT Android build works. */
export default function TimelinePage() {
  return <TimelineScreen />;
}
