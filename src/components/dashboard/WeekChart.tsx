import { motion } from 'motion/react';
import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';

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
    <div className="flex items-end justify-between gap-1 h-24">
      {days.map((d, i) => {
        const heightPct = (d.totalMinutes / maxMinutes) * 100;
        const isToday = i === days.length - 1;
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div className="flex-1 w-full flex items-end">
              <motion.div
                className={`w-full rounded-t-md ${isToday ? 'bg-accent' : 'bg-surface-2'}`}
                initial={{ height: 0 }}
                animate={{ height: `${heightPct}%` }}
                transition={{ duration: 0.3 }}
                style={{ minHeight: d.totalMinutes > 0 ? 4 : 0 }}
              />
            </div>
            <span className={`text-xs ${isToday ? 'text-accent' : 'text-text-muted'}`}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
