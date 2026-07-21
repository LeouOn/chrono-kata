import { Card } from '@/components/ui/Card';

interface Props {
  totalTokensThisMonth: number;
  resetAt: Date;
}

export function TokenMeter({ totalTokensThisMonth, resetAt }: Props) {
  // Rough cost estimate assuming 50/50 split
  const avgInputPer1k = 0.002;
  const avgOutputPer1k = 0.01;
  const estimatedCost = (totalTokensThisMonth / 2 / 1000) * avgInputPer1k +
                        (totalTokensThisMonth / 2 / 1000) * avgOutputPer1k;

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-1">This month</div>
      <div className="font-serif text-2xl text-text">
        {totalTokensThisMonth.toLocaleString()} <span className="text-base text-text-muted">tokens</span>
      </div>
      <div className="text-sm text-text-muted mt-1">
        ≈ ${estimatedCost.toFixed(3)} USD · resets {resetAt.toLocaleDateString()}
      </div>
    </Card>
  );
}
