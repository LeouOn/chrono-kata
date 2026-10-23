'use client';

import { PlanScreen } from '@/components/planning/PlanScreen';

/**
 * /plan — the daily planning step (roadmap Wave 6). Static route (no dynamic
 * segment) so the NEXT_EXPORT static build is happy; the day is always the
 * local today, and PlanScreen refreshes it on rollover.
 */
export default function PlanPage() {
  return <PlanScreen />;
}
