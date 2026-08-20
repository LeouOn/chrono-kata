'use client';

import { motion } from 'motion/react';
import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useDailyBriefing } from '@/hooks/useDailyBriefing';
import { useSettings } from '@/hooks/useSettings';

const COACH_EMOJIS: Record<string, string> = {
  zen: '🧘',
  hype: '⚡',
  analyst: '📊',
  buddy: '🤝',
  athena: '✦',
};

export function DailyBriefingCard() {
  const { settings } = useSettings();
  const { briefing, providerName, model, isLoading, error, generate } = useDailyBriefing();
  const personality = settings?.selectedCoachPersonality ?? 'zen';
  const emoji = COACH_EMOJIS[personality] ?? '🥋';

  if (!briefing && !isLoading && !error) {
    return (
      <button
        type="button"
        onClick={() => void generate()}
        className="w-full text-left bg-surface border border-border/80 hover:border-accent/40 rounded-2xl p-3.5 flex items-center justify-between gap-3 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-surface-2 flex items-center justify-center text-base group-hover:scale-110 transition-transform">
            {emoji}
          </div>
          <div>
            <div className="text-xs font-medium text-text capitalize">
              {personality} Coach Briefing
            </div>
            <div className="text-[11px] text-text-muted">
              Get an intentional focus and motivation for today
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-accent font-medium pr-1">
          <Sparkles size={13} />
          <span>Brief me</span>
        </div>
      </button>
    );
  }

  return (
    <Card>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">{emoji}</span>
            <span className="text-xs uppercase tracking-wide text-text-muted capitalize">
              Daily {personality} Briefing
            </span>
          </div>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={isLoading}
            className="text-text-muted hover:text-text p-1 transition-colors disabled:opacity-40"
            title="Refresh briefing"
            aria-label="Refresh briefing"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-accent' : ''} />
          </button>
        </div>

        {isLoading && (
          <div className="py-3 flex items-center justify-center gap-2 text-xs text-text-muted">
            <Sparkles size={14} className="animate-spin text-accent" />
            <span>Refining today&apos;s guidance...</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="flex items-center gap-2 text-xs text-hype py-1">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {briefing && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-1.5"
          >
            <p className="font-serif text-sm text-text leading-relaxed">
              &ldquo;{briefing}&rdquo;
            </p>
            {providerName && model && (
              <div className="text-[10px] text-text-muted">
                via {providerName} ({model})
              </div>
            )}
          </motion.div>
        )}
      </div>
    </Card>
  );
}
