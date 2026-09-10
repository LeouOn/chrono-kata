import React from 'react';
import { motion } from 'motion/react';
import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';
import { formatDuration } from '@/lib/utils/format';

interface Props {
  sessions: Session[];
}

export function WeekChart({ sessions }: Props) {
  // Build last 7 days.
  const days: { date: Date; label: string; totalMinutes: number }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({
      date: d,
      label: d.toLocaleDateString([], { weekday: 'narrow' }),
      totalMinutes: 0,
    });
  }

  // Sum minutes per day.
  const byDay = new Map(days.map((d) => [toLocalDateString(d.date), d]));
  for (const s of sessions) {
    const key = toLocalDateString(s.startedAt);
    const day = byDay.get(key);
    if (day) day.totalMinutes += s.durationMinutes ?? 0;
  }

  const maxMinutes = Math.max(60, ...days.map((d) => d.totalMinutes));

  return (
    <div className="flex items-end justify-between gap-1 h-28">
      {days.map((d, i) => {
        const heightPct = (d.totalMinutes / maxMinutes) * 100;
        const isToday = i === days.length - 1;
        const hasMinutes = d.totalMinutes > 0;
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            {/* Minutes label, only when there is something to read */}
            {hasMinutes && (
              <div
                className={`text-[10px] leading-none ${isToday ? 'text-accent' : 'text-text-muted'}`}
              >
                {formatDuration(d.totalMinutes)}
              </div>
            )}
            <div className="flex-1 w-full flex items-end">
              {hasMinutes ? (
                <motion.div
                  className={`w-full rounded-t-md ${isToday ? 'bg-accent' : 'bg-surface-2'}`}
                  initial={{ height: 0 }}
                  animate={{ height: `${heightPct}%` }}
                  transition={{ duration: 0.3 }}
                  style={{ minHeight: 4 }}
                />
              ) : (
                // Zero-day base keeps the column visible/readable as a chart column.
                <div className="w-full h-[2px] rounded-sm bg-border" aria-hidden />
              )}
            </div>
            <span className={`text-xs ${isToday ? 'text-accent' : 'text-text-muted'}`}>
              {d.label}
            </span>
            <span
              className={`text-[10px] leading-none ${isToday ? 'text-accent' : 'text-text-muted'}`}
            >
              {d.date.getDate()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
