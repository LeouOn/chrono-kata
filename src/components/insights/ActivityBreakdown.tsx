import { Card } from '@/components/ui/Card';
import { buildActivityBreakdown } from '@/lib/insights/breakdown';
import { formatDuration } from '@/lib/utils/format';
import type { Session } from '@/lib/schemas/session';

interface Props {
  sessions: Session[];
}

export function ActivityBreakdown({ sessions }: Props) {
  const entries = buildActivityBreakdown(sessions);
  const maxMinutes = Math.max(1, ...entries.map((e) => e.totalMinutes));

  if (entries.length === 0) {
    return (
      <Card>
        <div className="text-xs uppercase tracking-wide text-text-muted mb-2">Activities</div>
        <p className="text-text-muted text-sm">No sessions yet.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">Activities</div>
      <div className="space-y-2">
        {entries.slice(0, 10).map((e) => (
          <div key={e.label}>
            <div className="flex items-baseline justify-between text-sm mb-1">
              <span className="text-text truncate">{e.label}</span>
              <span className="text-text-muted text-xs ml-2 shrink-0">
                {e.totalMinutes > 0 ? formatDuration(e.totalMinutes) : `${e.totalReps} reps`}
                {' · '}
                {e.sessionCount} session{e.sessionCount === 1 ? '' : 's'}
                {' · '}
                avg {e.averageRating.toFixed(1)}/5
              </span>
            </div>
            {e.totalMinutes > 0 && (
              <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{ width: `${(e.totalMinutes / maxMinutes) * 100}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
