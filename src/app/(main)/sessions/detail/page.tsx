import { Suspense } from 'react';
import { SessionDetailClient } from './session-detail-client';

export default function SessionDetailPage() {
  return (
    <Suspense fallback={<div className="text-text-muted text-sm">Loading session…</div>}>
      <SessionDetailClient />
    </Suspense>
  );
}
