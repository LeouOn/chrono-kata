import { Card } from '@/components/ui/Card';
import { formatDuration } from '@/lib/utils/format';
import type { Session } from '@/lib/schemas/session';

interface Props {
  sessions: Session[];
}

export function TodaySummary({ sessions }: Props) {
  const totalMinutes = sessions.reduce(
    (sum, s) => sum + (s.durationMinutes ?? 0),
    0
  );
  const totalReps = sessions.reduce((sum, s) => sum + (s.reps ?? 0), 0);
  const avgRating =
    sessions.length > 0
      ? (sessions.reduce((sum, s) => sum + s.rating, 0) / sessions.length).toFixed(1)
      : '—';

  return (
    <Card>
      <div className="grid grid-cols-2 gap-y-3 gap-x-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Time</div>
          <div className="font-serif text-xl text-text">{formatDuration(totalMinutes)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Reps</div>
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
  );
}
