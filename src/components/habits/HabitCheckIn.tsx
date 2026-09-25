'use client';

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Minus, Plus, CalendarPlus } from 'lucide-react';
import { useHabits, useHabitLogsForDate } from '@/hooks/useHabits';
import { habitLogRepo } from '@/lib/db/habit-log.repo';
import { dayProgress, isHabitDueToday } from '@/lib/habits/schedule';
import { formatDuration } from '@/lib/utils/format';
import { toLocalDateString } from '@/lib/utils/date';
import type { Habit, HabitLog } from '@/lib/schemas/habit';

export function HabitCheckIn() {
  const { habits } = useHabits();
  const today = toLocalDateString(new Date());
  const logs = useHabitLogsForDate(today);
  const scheduled = habits.filter((h) => isHabitDueToday(h));

  if (scheduled.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-text-muted">Today&apos;s habits</div>
      <div className="divide-y divide-border rounded-2xl border border-border bg-surface overflow-hidden">
        {scheduled.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            logs={logs.filter((l) => l.habitId === habit.id)}
            today={today}
          />
        ))}
      </div>
    </div>
  );
}

function HabitRow({ habit, logs, today }: { habit: Habit; logs: HabitLog[]; today: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const progress = dayProgress(habit, logs);
  const hasManual = logs.some((l) => l.source === 'manual');
  const sessionComplete = progress.complete && !hasManual;

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['habit-logs'] });
  }

  async function toggleBoolean() {
    if (habit.kind !== 'boolean') return;
    if (progress.complete) {
      if (hasManual) {
        await habitLogRepo.deleteManualForHabitAndDate(habit.id, today);
        refresh();
      }
      return;
    }
    await habitLogRepo.add({ habitId: habit.id, date: today, minutes: null, delta: null, source: 'manual' });
    refresh();
  }

  async function bumpCount(direction: 1 | -1) {
    if (habit.kind !== 'count') return;
    if (direction === 1) {
      await habitLogRepo.add({ habitId: habit.id, date: today, minutes: null, delta: 1, source: 'manual' });
    } else {
      await habitLogRepo.decrementManualCount(habit.id, today);
    }
    refresh();
  }

  return (
    <div className="px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-xl w-7 text-center flex-shrink-0">{habit.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text truncate">{habit.name}</div>
          <div className={`text-xs ${progress.complete ? 'text-accent' : 'text-text-muted'}`}>
            {habit.kind === 'boolean'
              ? progress.complete
                ? 'Done'
                : 'Not yet'
              : habit.kind === 'timed'
                ? `${formatDuration(progress.value)} / ${formatDuration(progress.target ?? 0)}`
                : `${progress.value} / ${progress.target ?? 0} ${habit.unit ?? ''}`}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {habit.kind === 'boolean' && (
            <button
              type="button"
              onClick={() => void toggleBoolean()}
              disabled={sessionComplete}
              title={sessionComplete ? 'Marked by a linked session' : undefined}
              aria-pressed={progress.complete}
              aria-label={progress.complete ? `Mark ${habit.name} not done` : `Mark ${habit.name} done`}
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
                progress.complete
                  ? 'bg-accent border-accent text-base'
                  : 'border-border text-text-muted hover:border-accent/40'
              } disabled:opacity-60`}
            >
              <Check size={16} strokeWidth={3} />
            </button>
          )}
          {habit.kind === 'count' && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void bumpCount(-1)}
                disabled={!hasManual}
                aria-label={`Remove one ${habit.unit ?? ''} from ${habit.name}`}
                className="w-8 h-8 rounded-full bg-surface-2 text-text-muted flex items-center justify-center disabled:opacity-30"
              >
                <Minus size={15} />
              </button>
              <button
                type="button"
                onClick={() => void bumpCount(1)}
                aria-label={`Add one ${habit.unit ?? ''} to ${habit.name}`}
                className="w-8 h-8 rounded-full bg-surface-2 text-text-muted hover:text-accent flex items-center justify-center"
              >
                <Plus size={15} />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={`Log an entry for ${habit.name}, including an earlier day`}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              expanded ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-text-muted hover:text-text'
            }`}
          >
            <CalendarPlus size={15} />
          </button>
        </div>
      </div>

      {expanded && (
        <HabitEntryForm
          habit={habit}
          defaultDate={today}
          onDone={() => {
            setExpanded(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function HabitEntryForm({
  habit,
  defaultDate,
  onDone,
}: {
  habit: Habit;
  defaultDate: string;
  onDone: () => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Pick a date.');
      return;
    }
    if (habit.kind === 'timed') {
      const minutes = Number(value);
      if (!value || !Number.isFinite(minutes) || minutes <= 0) {
        setError('Enter minutes greater than 0.');
        return;
      }
      await habitLogRepo.add({ habitId: habit.id, date, minutes, delta: null, source: 'manual' });
    } else if (habit.kind === 'count') {
      const delta = Number(value);
      if (!value || !Number.isInteger(delta) || delta <= 0) {
        setError(`Enter a whole number of ${habit.unit ?? 'units'}.`);
        return;
      }
      await habitLogRepo.add({ habitId: habit.id, date, minutes: null, delta, source: 'manual' });
    } else {
      await habitLogRepo.add({ habitId: habit.id, date, minutes: null, delta: null, source: 'manual' });
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="mt-2.5 pt-2.5 border-t border-border flex items-end gap-2">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">Day</div>
        <input
          type="date"
          aria-label="Day"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-surface-2 rounded-xl px-2.5 py-1.5 text-sm text-text border border-border outline-none"
        />
      </div>
      {habit.kind !== 'boolean' && (
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1">
            {habit.kind === 'timed' ? 'Minutes' : habit.unit ?? 'Amount'}
          </label>
          <input
            type="number"
            min={habit.kind === 'timed' ? 'any' : '1'}
            step={habit.kind === 'timed' ? 'any' : '1'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={habit.kind === 'timed' ? 'e.g. 3.5' : 'e.g. 10'}
            className="w-full bg-surface-2 rounded-xl px-2.5 py-1.5 text-sm text-text border border-border outline-none"
          />
        </div>
      )}
      <button
        type="submit"
        className="rounded-full bg-accent text-base px-4 py-2 text-sm font-medium flex-shrink-0"
      >
        {habit.kind === 'boolean' ? 'Mark done' : 'Add'}
      </button>
      {error && <p className="text-xs text-hype w-full">{error}</p>}
    </form>
  );
}
