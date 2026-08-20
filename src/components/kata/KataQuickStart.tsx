'use client';

import { motion } from 'motion/react';
import { Play } from 'lucide-react';
import type { KataTemplate } from '@/lib/schemas/kata-template';
import { formatDuration } from '@/lib/utils/format';

interface Props {
  templates: KataTemplate[];
  onSelect: (template: KataTemplate) => void;
}

export function KataQuickStart({ templates, onSelect }: Props) {
  if (templates.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-text-muted">
          Quick Start Katas
        </div>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
        {templates.map((t) => (
          <motion.button
            key={t.id}
            onClick={() => onSelect(t)}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.02 }}
            className="flex-shrink-0 flex items-center gap-3 bg-surface border border-border hover:border-accent/40 rounded-2xl p-3 text-left transition-all shadow-sm group min-w-[170px]"
          >
            <div className="text-2xl w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              {t.icon || '🥋'}
            </div>
            <div className="flex-1 min-w-0 pr-1">
              <div className="text-sm font-medium text-text truncate">
                {t.name}
              </div>
              <div className="text-xs text-text-muted flex items-center gap-1.5 mt-0.5">
                <span>
                  {t.mode === 'timed' && t.defaultDurationMinutes != null
                    ? formatDuration(t.defaultDurationMinutes)
                    : t.mode === 'reps' && t.defaultReps != null
                      ? `${t.defaultReps} reps`
                      : t.mode}
                </span>
                {t.activityLabel && (
                  <>
                    <span>•</span>
                    <span className="truncate">{t.activityLabel}</span>
                  </>
                )}
              </div>
            </div>
            <div className="w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0 group-hover:bg-accent group-hover:text-base transition-colors">
              <Play size={13} fill="currentColor" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
