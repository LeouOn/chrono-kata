'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import {
  buildYearlyConsistencyMatrix,
  type HeatmapDay,
} from '@/lib/insights/yearly-matrix';
import { formatDuration } from '@/lib/utils/format';
import type { Session } from '@/lib/schemas/session';

interface Props {
  sessions: Session[];
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const INTENSITY_COLORS = [
  'bg-surface-2/50 border border-border/20',
  'bg-accent/30 border border-accent/20',
  'bg-accent/55 border border-accent/30',
  'bg-accent/80 border border-accent/40',
  'bg-accent border border-accent/60 shadow-sm shadow-accent/20',
];

export function YearlyConsistencyHeatmap({ sessions }: Props) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [hoveredDay, setHoveredDay] = useState<HeatmapDay | null>(null);

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    for (const s of sessions) {
      years.add(s.startedAt.getFullYear());
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [sessions, currentYear]);

  const matrix = useMemo(() => {
    return buildYearlyConsistencyMatrix(sessions, selectedYear);
  }, [sessions, selectedYear]);

  return (
    <Card>
      <div className="space-y-3">
        {/* Header & Stats */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-text-muted">
              Annual Consistency
            </div>
            <div className="text-sm font-serif text-text mt-0.5">
              <span className="text-accent font-semibold">{matrix.totalPracticedDays}</span> days active •{' '}
              <span className="text-accent font-semibold">{formatDuration(matrix.totalMinutesInYear)}</span> total
            </div>
          </div>

          {/* Year Selector */}
          {availableYears.length > 1 && (
            <div className="flex gap-1 bg-surface-2 p-0.5 rounded-xl text-xs">
              {availableYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setSelectedYear(y)}
                  className={`px-2 py-1 rounded-lg font-medium transition-colors ${
                    selectedYear === y
                      ? 'bg-accent text-base'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Month Labels Bar */}
        <div className="flex justify-between text-[10px] text-text-muted px-1">
          {MONTH_LABELS.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>

        {/* Heatmap Grid Matrix */}
        <div className="overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
          <div className="flex gap-1 min-w-[580px]">
            {matrix.weeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-1 flex-1">
                {week.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setHoveredDay(day)}
                    onMouseEnter={() => setHoveredDay(day)}
                    className={`w-full aspect-square rounded-[3px] transition-all hover:scale-125 hover:z-10 ${
                      INTENSITY_COLORS[day.intensity]
                    }`}
                    title={`${day.date}: ${day.totalMinutes}m (${day.sessionCount} sessions)`}
                    aria-label={`${day.date}: ${day.totalMinutes} minutes practiced`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Active Tooltip & Legend */}
        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/40 min-h-[24px]">
          <div className="text-text-muted truncate">
            {hoveredDay ? (
              <span>
                <strong className="text-text">{hoveredDay.date}</strong>: {hoveredDay.totalMinutes > 0 ? `${hoveredDay.totalMinutes} min` : `${hoveredDay.totalReps} reps`}{' '}
                ({hoveredDay.sessionCount} session{hoveredDay.sessionCount === 1 ? '' : 's'})
                {hoveredDay.dominantActivity && ` • ${hoveredDay.dominantActivity}`}
              </span>
            ) : (
              <span>Hover or tap any square to inspect practice details</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-text-muted flex-shrink-0">
            <span>Less</span>
            <div className="flex gap-0.5">
              {INTENSITY_COLORS.map((c, i) => (
                <div key={i} className={`w-2.5 h-2.5 rounded-[2px] ${c}`} />
              ))}
            </div>
            <span>More</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
