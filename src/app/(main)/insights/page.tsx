'use client';

import { useQuery } from '@tanstack/react-query';
import { Heatmap } from '@/components/insights/Heatmap';
import { ActivityBreakdown } from '@/components/insights/ActivityBreakdown';
import { RatingTrends } from '@/components/insights/RatingTrends';
import { Card } from '@/components/ui/Card';
import { sessionRepo } from '@/lib/db/session.repo';
import { formatDuration } from '@/lib/utils/format';

export default function InsightsPage() {
  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionRepo.getAll(),
  });

  const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
  const totalReps = sessions.reduce((sum, s) => sum + (s.reps ?? 0), 0);
  const avgRating = sessions.length > 0
    ? (sessions.reduce((sum, s) => sum + s.rating, 0) / sessions.length).toFixed(2)
    : '—';

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Insights</h1>

      <Card>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-text-muted">All-time time</div>
            <div className="font-serif text-xl text-text">{formatDuration(totalMinutes)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-text-muted">All-time reps</div>
            <div className="font-serif text-xl text-text">{totalReps}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-text-muted">Sessions</div>
            <div className="font-serif text-xl text-text">{sessions.length}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-text-muted">Avg rating</div>
            <div className="font-serif text-xl text-text">{avgRating}</div>
          </div>
        </div>
      </Card>

      <Heatmap sessions={sessions} />
      <RatingTrends sessions={sessions} />
      <ActivityBreakdown sessions={sessions} />
    </div>
  );
}
