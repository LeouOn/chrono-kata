import { Card } from '@/components/ui/Card';
import { buildRatingTrend } from '@/lib/insights/trends';
import type { Session } from '@/lib/schemas/session';

interface Props {
  sessions: Session[];
}

export function RatingTrends({ sessions }: Props) {
  const days = buildRatingTrend(sessions, new Date());
  const width = 300;
  const height = 80;
  const padding = 8;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Build polyline points. Skip nulls.
  const points: Array<{ x: number; y: number; rating: number }> = [];
  days.forEach((d, i) => {
    if (d.averageRating != null) {
      const x = padding + (i / (days.length - 1)) * chartWidth;
      const y = padding + (1 - (d.averageRating - 1) / 4) * chartHeight;
      points.push({ x, y, rating: d.averageRating });
    }
  });

  const path = points.length > 0
    ? `M ${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`
    : '';

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-2">Rating trend (30 days)</div>
      {points.length === 0 ? (
        <p className="text-text-muted text-sm py-8 text-center">No rated sessions in the last 30 days.</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines for ratings 1, 3, 5 */}
          {[1, 3, 5].map((r) => {
            const y = padding + (1 - (r - 1) / 4) * chartHeight;
            return (
              <g key={r}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="2 2" />
                <text x={padding - 2} y={y + 3} textAnchor="end" fontSize="9" fill="var(--color-text-muted)">{r}</text>
              </g>
            );
          })}
          {/* Trend line */}
          <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {/* Points */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--color-accent)" />
          ))}
        </svg>
      )}
    </Card>
  );
}
