'use client';

import { ReviewWizard } from '@/components/review/ReviewWizard';

/**
 * /review — the weekly review wizard (roadmap Wave 11). Static route so the
 * static export is happy; the reviewed week comes from the local clock and
 * from a resumable draft, both resolved inside the component.
 */
export default function ReviewPage() {
  return <ReviewWizard />;
}
