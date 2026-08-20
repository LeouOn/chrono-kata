'use client';

import { Card } from '@/components/ui/Card';
import { formatDuration } from '@/lib/utils/format';
import { useSettings } from '@/hooks/useSettings';
import { GoalProgressRing } from './GoalProgressRing';
import type { Session } from '@/lib/schemas/session';

interface Props {
  sessions: Session[];
  goalMinutes?: number;
}

export function TodaySummary({ sessions, goalMinutes }: Props) {
  const { settings } = useSettings();
  const effectiveGoal = goalMinutes ?? settings?.dailyGoalMinutes ?? 20;

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
      <div className="flex items-center justify-between gap-4">
        <div className="grid grid-cols-2 gap-y-3 gap-x-6 flex-1">
          <div>
            <div className="text-xs uppercase tracking-wide text-text-muted">Today</div>
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

        <div className="flex flex-col items-center flex-shrink-0 pl-2 border-l border-border/60">
          <GoalProgressRing
            currentMinutes={totalMinutes}
            goalMinutes={effectiveGoal}
            size={60}
          />
          <div className="text-[10px] text-text-muted uppercase tracking-wider mt-1.5 font-medium">
            Goal {effectiveGoal}m
          </div>
        </div>
      </div>
    </Card>
  );
}
