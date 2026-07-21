import { Card } from '@/components/ui/Card';
import type { Session } from '@/lib/schemas/session';

interface Props {
  sessions: Session[];
}

function avg(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

export function MultiDimAverages({ sessions }: Props) {
  const last7 = sessions.filter((s) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return s.startedAt >= sevenDaysAgo;
  });

  const focus = avg(last7.map((s) => s.focusRating));
  const energy = avg(last7.map((s) => s.energyRating));
  const mood = avg(last7.map((s) => s.moodRating));

  const allNull = focus == null && energy == null && mood == null;
  if (allNull) {
    return (
      <Card>
        <div className="text-xs uppercase tracking-wide text-text-muted mb-2">How the practice felt (7 days)</div>
        <p className="text-text-muted text-sm italic">
          No multi-dimensional ratings yet. Try filling focus, energy, or mood on your next session.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">
        How the practice felt (7 days, n={last7.length})
      </div>
      <div className="grid grid-cols-3 gap-4">
        <DimColumn label="Focus" value={focus} />
        <DimColumn label="Energy" value={energy} />
        <DimColumn label="Mood" value={mood} />
      </div>
    </Card>
  );
}

function DimColumn({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="text-text-muted text-xs uppercase tracking-wide mb-1">{label}</div>
      <div className="font-serif text-2xl text-text">
        {value != null ? value.toFixed(1) : '—'}
        <span className="text-text-muted text-sm"> /5</span>
      </div>
    </div>
  );
}