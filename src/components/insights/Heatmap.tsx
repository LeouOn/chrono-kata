import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { buildHeatmapData, type HeatmapCell } from '@/lib/insights/heatmap';
import type { Session } from '@/lib/schemas/session';
import { formatDuration } from '@/lib/utils/format';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const INTENSITY_COLORS = [
  'bg-surface-2',
  'bg-accent/30',
  'bg-accent/50',
  'bg-accent/70',
  'bg-accent',
];

interface Props {
  sessions: Session[];
}

export function Heatmap({ sessions }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const data = useMemo(() => buildHeatmapData(sessions, year), [sessions, year]);
  const [hovered, setHovered] = useState<HeatmapCell | null>(null);

  // Group cells by month for column headers.
  const monthGroups = useMemo(() => {
    const groups: HeatmapCell[][] = [];
    let currentMonth = -1;
    for (const cell of data.cells) {
      const m = Number(cell.date.slice(5, 7)) - 1;
      if (m !== currentMonth) {
        groups.push([]);
        currentMonth = m;
      }
      groups[groups.length - 1]!.push(cell);
    }
    return groups;
  }, [data]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Heatmap</div>
          <div className="font-serif text-lg text-text">{year}</div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="text-text-muted hover:text-text px-2"
            aria-label="Previous year"
          >‹</button>
          <button
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= currentYear}
            className="text-text-muted hover:text-text px-2 disabled:opacity-30"
            aria-label="Next year"
          >›</button>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-[3px] min-w-max">
          {monthGroups.map((cells, monthIdx) => (
            <div key={monthIdx} className="flex flex-col gap-[3px]">
              <div className="text-[10px] text-text-muted h-3">{MONTH_LABELS[Number(cells[0]!.date.slice(5, 7)) - 1]}</div>
              {cells.map((cell) => (
                <div
                  key={cell.date}
                  className={`w-[10px] h-[10px] rounded-sm ${INTENSITY_COLORS[cell.intensity]} ${cell.sessionCount > 0 ? 'cursor-pointer' : ''}`}
                  onMouseEnter={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                  title={`${cell.date}: ${cell.sessionCount} session${cell.sessionCount === 1 ? '' : 's'}, ${formatDuration(cell.totalMinutes)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-text-muted">
        <div>
          {hovered ? (
            <span>{hovered.date} · {hovered.sessionCount} session{hovered.sessionCount === 1 ? '' : 's'} · {formatDuration(hovered.totalMinutes)}</span>
          ) : (
            <span>Hover a day for details</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span>Less</span>
          {INTENSITY_COLORS.map((c, i) => (
            <div key={i} className={`w-[10px] h-[10px] rounded-sm ${c}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </Card>
  );
}
