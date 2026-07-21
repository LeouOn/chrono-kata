import { Card } from '@/components/ui/Card';
import type { Reflection } from '@/lib/schemas/reflection';

interface Props {
  reflection: Reflection;
}

export function ReflectionCard({ reflection }: Props) {
  const start = reflection.periodStart.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const end = reflection.periodEnd.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
        {start} – {end}
      </div>
      <ul className="space-y-2 mb-3">
        {reflection.observations.map((o, i) => (
          <li key={i} className="text-sm text-text flex gap-2">
            <span className="text-accent">•</span>
            <span>{o}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-border pt-3 mt-3">
        <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
          Question to sit with
        </div>
        <p className="font-serif text-base text-text italic">{reflection.question}</p>
      </div>
    </Card>
  );
}
