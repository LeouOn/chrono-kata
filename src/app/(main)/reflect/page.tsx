'use client';

import { useReflections } from '@/hooks/useReflections';
import { ReflectionCard } from '@/components/reflection/ReflectionCard';
import { Button } from '@/components/ui/Button';

export default function ReflectPage() {
  const { reflections, generate, isGenerating, error } = useReflections();

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Reflect</h1>

      <Button
        onClick={() => generate()}
        disabled={isGenerating}
      >
        {isGenerating ? 'Reflecting…' : '✨ Reflect on this week'}
      </Button>

      {error && (
        <p className="text-hype text-sm">{error.message}</p>
      )}

      <div className="space-y-3">
        {reflections.length === 0 && !isGenerating && (
          <p className="text-text-muted text-sm">
            No reflections yet. Generate one based on your last 7 days of practice.
          </p>
        )}
        {reflections.map((r) => (
          <ReflectionCard key={r.id} reflection={r} />
        ))}
      </div>
    </div>
  );
}
