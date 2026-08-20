'use client';

import { Card } from '@/components/ui/Card';
import { useSettings } from '@/hooks/useSettings';
import type { DayOfWeek } from '@/lib/schemas/settings';
import { Flame, ShieldCheck } from 'lucide-react';

const DAYS: Array<{ id: DayOfWeek; label: string }> = [
  { id: 'mon', label: 'M' },
  { id: 'tue', label: 'T' },
  { id: 'wed', label: 'W' },
  { id: 'thu', label: 'T' },
  { id: 'fri', label: 'F' },
  { id: 'sat', label: 'S' },
  { id: 'sun', label: 'S' },
];

const DAILY_PRESETS = [15, 20, 30, 45, 60];

export function GoalSettings() {
  const { settings, updateSettings } = useSettings();

  const dailyGoal = settings?.dailyGoalMinutes ?? 20;
  const weeklyGoal = settings?.weeklyGoalDays ?? 5;
  const restDays = settings?.restDays ?? [];
  const freezeTokens = settings?.streakFreezeTokens ?? 1;

  function toggleRestDay(day: DayOfWeek) {
    const isSelected = restDays.includes(day);
    const updated = isSelected
      ? restDays.filter((d) => d !== day)
      : [...restDays, day];
    void updateSettings({ restDays: updated });
  }

  return (
    <Card>
      <div className="space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <div className="text-text-muted uppercase tracking-wide">
            Habit Goals & Streak Protection
          </div>
          <div className="flex items-center gap-1.5 text-accent font-medium">
            <ShieldCheck size={14} />
            <span>Active</span>
          </div>
        </div>

        {/* Daily Practice Target */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-text font-medium">Daily Target</span>
            <span className="text-accent font-serif text-sm">{dailyGoal} min / day</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {DAILY_PRESETS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => void updateSettings({ dailyGoalMinutes: mins })}
                className={`py-1.5 rounded-xl font-medium transition-colors ${
                  dailyGoal === mins
                    ? 'bg-accent text-base'
                    : 'bg-surface-2 text-text-muted hover:text-text'
                }`}
              >
                {mins}m
              </button>
            ))}
          </div>
        </div>

        {/* Weekly Days Target */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-text font-medium">Weekly Target</span>
            <span className="text-accent font-serif text-sm">{weeklyGoal} days / week</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => void updateSettings({ weeklyGoalDays: days })}
                className={`py-1 rounded-xl font-medium transition-colors ${
                  weeklyGoal === days
                    ? 'bg-accent text-base'
                    : 'bg-surface-2 text-text-muted hover:text-text'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        {/* Designated Rest Days */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-text font-medium">Designated Rest Days</span>
            <span className="text-text-muted text-[11px]">
              {restDays.length === 0 ? 'No rest days' : `${restDays.length} days protected`}
            </span>
          </div>
          <p className="text-text-muted text-[11px] mb-2">
            Resting on selected days will not break your practice streak.
          </p>
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((d) => {
              const active = restDays.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleRestDay(d.id)}
                  className={`py-2 rounded-xl font-semibold transition-all ${
                    active
                      ? 'bg-accent text-base scale-105 shadow-sm'
                      : 'bg-surface-2 text-text-muted hover:text-text'
                  }`}
                  title={`${d.id.toUpperCase()} Rest Day`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Streak Freeze Token Status */}
        <div className="pt-2 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
              <Flame size={15} />
            </div>
            <div>
              <div className="font-medium text-text">Streak Freeze</div>
              <div className="text-[11px] text-text-muted">
                Forgives 1 unplanned missed day automatically
              </div>
            </div>
          </div>
          <div className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-2 text-accent">
            {freezeTokens} ❄️ Token
          </div>
        </div>
      </div>
    </Card>
  );
}
