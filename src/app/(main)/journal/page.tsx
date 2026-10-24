import { Suspense } from 'react';
import { JournalPageClient } from './journal-client';

/**
 * /journal — the daily journal and the evening shutdown (roadmap Wave 12).
 * A static route (no dynamic segment) so the Android static export is happy;
 * the day comes from `?date=` or the local today, both read on the client.
 */
export default function JournalPage() {
  return (
    <Suspense fallback={<div className="text-text-muted text-sm">Loading the journal…</div>}>
      <JournalPageClient />
    </Suspense>
  );
}
