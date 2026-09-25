'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { habitLogRepo } from '@/lib/db/habit-log.repo';
import { useHabits } from '@/hooks/useHabits';
import {
  activeHabits,
  daysBetween,
  formatElapsed,
  formatMinuteAmount,
  formatShortDay,
  latestLogDate,
  loggedCount,
  loggedMinutes,
  manualMinutes,
  scheduledHabits,
  shiftLocalDate,
} from '@/lib/habits/today';
import { dispatchToast } from '@/components/ui/Toast';
import {
  habitTimerElapsed,
  pauseHabitTimer,
  readHabitTimer,
  startHabitTimer,
  subscribeHabitTimer,
} from '@/lib/timers/habit-timer';
import { toLocalDateString } from '@/lib/utils/date';
import type { Habit, HabitLog } from '@/lib/schemas/habit';

const accentButton =
  'rounded-full bg-accent text-base px-4 min-h-11 text-sm font-medium disabled:opacity-40';
const quietButton =
  'rounded-full border border-border px-3 min-h-11 text-sm text-text disabled:opacity-40';

export function TodayHabits() {
  const { habits, isLoading } = useHabits();
  const qc = useQueryClient();
  const today = toLocalDateString(new Date());
  const yesterday = shiftLocalDate(today, -1);
  const { data: logs = [] } = useQuery({
    queryKey: ['habit-logs', 'all'],
    queryFn: () => habitLogRepo.getAll(),
  });
  const [timer, setTimer] = useState(readHabitTimer());
  const [now, setNow] = useState(() => Date.now());
  const [yesterdayOpen, setYesterdayOpen] = useState(false);
  const [live, setLive] = useState('');

  useEffect(() => subscribeHabitTimer(() => setTimer(readHabitTimer())), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = readHabitTimer();
      if (stored?.runningSinceMs != null) {
        await pauseHabitTimer();
        if (!cancelled) {
          void qc.invalidateQueries({ queryKey: ['habit-logs'] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qc]);

  useEffect(() => {
    if (timer?.runningSinceMs == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer?.runningSinceMs, timer?.habitId]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      const current = readHabitTimer();
      if (current?.runningSinceMs == null) return;
      void pauseHabitTimer().then(() => {
        void qc.invalidateQueries({ queryKey: ['habit-logs'] });
      });
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [qc]);

  useEffect(() => {
    setYesterdayOpen(false);
  }, [today]);

  useEffect(() => {
    if (timer?.runningSinceMs == null) return;
    const habit = habits.find((item) => item.id === timer.habitId);
    if (!habit || habit.kind !== 'timed' || habit.targetPerDay == null) return;
    const logged = loggedMinutes(logs.filter((log) => log.habitId === habit.id && log.date === timer.date));
    const elapsed = logged + habitTimerElapsed(timer, now) / 60_000;
    if (elapsed < habit.targetPerDay) return;
    void pauseHabitTimer().then(() => {
      void qc.invalidateQueries({ queryKey: ['habit-logs'] });
    });
  }, [habits, logs, now, qc, timer]);

  if (isLoading) return null;

  const catalog = activeHabits(habits);
  const todayList = scheduledHabits(habits, today);
  const yesterdayList = scheduledHabits(habits, yesterday);
  const last = latestLogDate(logs);
  const showLastLog = last != null && daysBetween(last, today) >= 3;

  async function run(action: () => Promise<void>) {
    try {
      await action();
      void qc.invalidateQueries({ queryKey: ['habit-logs'] });
    } catch (error) {
      dispatchToast(error instanceof Error ? error.message : 'Could not update that habit.', 'error');
    }
  }

  return (
    <section className="space-y-2" aria-labelledby="today-habits-heading">
      <div className="flex items-center justify-between">
        <h2 id="today-habits-heading" className="text-xs uppercase tracking-wide text-text-muted">
          Today
        </h2>
        {yesterdayList.length > 0 && (
          <button
            type="button"
            className="text-xs text-accent"
            aria-expanded={yesterdayOpen}
            onClick={() => setYesterdayOpen((open) => !open)}
          >
            {yesterdayOpen ? 'Close yesterday' : 'Log yesterday'}
          </button>
        )}
      </div>

      <p className="sr-only" aria-live="polite">{live}</p>

      {catalog.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm text-text">Nothing in the habit list yet.</p>
          <Link href="/settings#habits" className="mt-3 inline-flex items-center rounded-full bg-accent text-base px-4 min-h-11 text-sm font-medium">
            Add a habit
          </Link>
        </div>
      ) : todayList.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing scheduled today.</p>
      ) : (
        <HabitDay
          habits={todayList}
          logs={logs}
          date={today}
          dateLabel={null}
          timer={timer}
          now={now}
          onLive={setLive}
          run={run}
        />
      )}

      {showLastLog && last && (
        <p className="text-xs text-text-muted">Last log: {formatShortDay(last)}.</p>
      )}

      {yesterdayOpen && (
        <div className="space-y-2 rounded-2xl border border-border p-3">
          <h3 className="text-sm text-text">Yesterday · {formatShortDay(yesterday)}</h3>
          <HabitDay
            habits={yesterdayList}
            logs={logs}
            date={yesterday}
            dateLabel={formatShortDay(yesterday)}
            timer={null}
            now={now}
            onLive={setLive}
            run={run}
            yesterday
          />
        </div>
      )}
    </section>
  );
}

function HabitDay({
  habits,
  logs,
  date,
  dateLabel,
  timer,
  now,
  onLive,
  run,
  yesterday = false,
}: {
  habits: Habit[];
  logs: HabitLog[];
  date: string;
  dateLabel: string | null;
  timer: ReturnType<typeof readHabitTimer>;
  now: number;
  onLive: (text: string) => void;
  run: (action: () => Promise<void>) => Promise<void>;
  yesterday?: boolean;
}) {
  const rows = habits.map((habit) => {
    const dayLogs = logs.filter((log) => log.habitId === habit.id && log.date === date);
    const running = !yesterday && timer?.habitId === habit.id && timer.date === date && timer.runningSinceMs != null;
    const extraMs = !yesterday && timer?.habitId === habit.id && timer.date === date ? habitTimerElapsed(timer, now) : 0;
    const minutes = loggedMinutes(dayLogs) + extraMs / 60_000;
    const reversibleMs = manualMinutes(dayLogs) * 60_000 + extraMs;
    const count = loggedCount(dayLogs);
    const target = habit.targetPerDay ?? 0;
    const complete = habit.kind === 'boolean' ? dayLogs.length > 0 : habit.kind === 'timed' ? minutes >= target && target > 0 : count >= target && target > 0;
    return { habit, dayLogs, running, minutes, reversibleMs, count, target, complete };
  });
  const open = rows.filter((row) => !row.complete || row.running);
  const done = rows.filter((row) => row.complete && !row.running);
  const allDone = !yesterday && rows.length > 0 && open.length === 0;

  return (
    <div className="space-y-2">
      {allDone && <p className="text-sm text-text">That&apos;s the list for today.</p>}
      {open.map((row) => (
        <HabitCard key={row.habit.id} {...row} date={date} dateLabel={dateLabel} yesterday={yesterday} onLive={onLive} run={run} />
      ))}
      {done.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-text-muted">Done</div>
          {done.map((row) => (
            <HabitCard key={row.habit.id} {...row} date={date} dateLabel={dateLabel} yesterday={yesterday} onLive={onLive} run={run} done />
          ))}
        </div>
      )}
    </div>
  );
}

function HabitCard({
  habit,
  dayLogs,
  running,
  minutes,
  reversibleMs,
  count,
  target,
  complete,
  date,
  dateLabel,
  yesterday,
  done,
  onLive,
  run,
}: {
  habit: Habit;
  dayLogs: HabitLog[];
  running: boolean;
  minutes: number;
  reversibleMs: number;
  count: number;
  target: number;
  complete: boolean;
  date: string;
  dateLabel: string | null;
  yesterday?: boolean;
  done?: boolean;
  onLive: (text: string) => void;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const suffix = dateLabel ? ` for ${dateLabel}` : '';
  const sessionOnly = !dayLogs.some((log) => log.source === 'manual') && dayLogs.some((log) => log.source === 'session');

  async function start() {
    await pauseHabitTimer();
    startHabitTimer(habit.id, date);
    onLive(`${habit.name}, started.`);
  }

  async function pause() {
    await pauseHabitTimer();
    onLive(`${habit.name}, paused.`);
  }

  let status = 'Not yet';
  if (habit.kind === 'timed') {
    const clock = formatElapsed(minutes * 60_000);
    status = running ? `Running · ${clock} of ${formatMinuteAmount(target)}` : `${clock} of ${formatMinuteAmount(target)}`;
  } else if (habit.kind === 'count') {
    status = `${count} of ${target} ${habit.unit ?? ''}`.trim();
  } else if (complete) {
    status = 'Done';
  }

  const ratio = habit.kind === 'timed' && target > 0 ? minutes / target : habit.kind === 'count' && target > 0 ? count / target : 0;

  return (
    <div className={`rounded-2xl border border-border bg-surface px-3 py-3 ${done ? 'opacity-80' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text truncate">{habit.name}</div>
          <div className="text-xs text-text-muted" {...(running ? { role: 'timer' as const, 'aria-label': `${habit.name} ${status}` } : {})}>
            {status}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {habit.kind === 'timed' && !yesterday && !complete && (
            <button type="button" className={running ? quietButton : accentButton} onClick={() => void run(running ? pause : start)}>
              {running ? 'Pause' : reversibleMs > 500 || minutes > 0 ? 'Resume' : 'Start'}
            </button>
          )}
          {habit.kind === 'timed' && yesterday && (
            <button
              type="button"
              className={accentButton}
              aria-label={`Add 1 minute to ${habit.name}${suffix}`}
              onClick={() => void run(async () => {
                await habitLogRepo.add({ habitId: habit.id, date, minutes: 1, delta: null, source: 'manual' });
                onLive(`${habit.name}, ${formatMinuteAmount(minutes + 1)}.`);
              })}
            >
              +1 min
            </button>
          )}
          {habit.kind === 'boolean' && !complete && (
            <button
              type="button"
              className={accentButton}
              aria-label={`Mark ${habit.name} done${suffix}`}
              onClick={() => void run(async () => {
                await habitLogRepo.add({ habitId: habit.id, date, minutes: null, delta: null, source: 'manual' });
                onLive(`${habit.name}, done.`);
              })}
            >
              Done
            </button>
          )}
          {habit.kind === 'count' && !done && (
            <button
              type="button"
              className={accentButton}
              aria-label={`Add 1 ${habit.unit ?? ''} to ${habit.name}${suffix}`.replace(/\s+/g, ' ')}
              onClick={() => void run(async () => {
                await habitLogRepo.add({ habitId: habit.id, date, minutes: null, delta: 1, source: 'manual' });
                onLive(`${habit.name}, ${count + 1} of ${target} ${habit.unit ?? ''}.`);
              })}
            >
              +1
            </button>
          )}
        </div>
      </div>

      {(habit.kind === 'timed' || habit.kind === 'count') && target > 0 && (
        <div
          className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(target, habit.kind === 'timed' ? Math.round(minutes * 10) / 10 : count)}
          aria-label={`${habit.name} progress`}
        >
          <div className="h-full bg-accent" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        {habit.kind === 'boolean' && complete && !sessionOnly && (
          <button
            type="button"
            className={quietButton}
            aria-label={`Undo ${habit.name}${suffix}`}
            onClick={() => void run(async () => {
              await habitLogRepo.deleteManualForHabitAndDate(habit.id, date);
              onLive(`${habit.name}, not done.`);
            })}
          >
            Undo
          </button>
        )}
        {habit.kind === 'timed' && !yesterday && !running && reversibleMs > 500 && reversibleMs < 60_000 && (
          <button
            type="button"
            className={quietButton}
            aria-label={`Undo ${habit.name}`}
            onClick={() => void run(async () => {
              await habitLogRepo.removeManualMinutes(habit.id, date, manualMinutes(dayLogs));
              onLive(`${habit.name}, undone.`);
            })}
          >
            Undo
          </button>
        )}
        {habit.kind === 'timed' && (yesterday || reversibleMs >= 60_000) && (
          <button
            type="button"
            className={quietButton}
            aria-disabled={reversibleMs < 60_000}
            aria-label={reversibleMs < 60_000 ? `Remove 1 minute from ${habit.name}${suffix}, none to remove` : `Remove 1 minute from ${habit.name}${suffix}`}
            onClick={() => {
              if (reversibleMs < 60_000) return;
              void run(async () => {
                await habitLogRepo.removeManualMinutes(habit.id, date, 1);
                onLive(`${habit.name}, ${formatMinuteAmount(Math.max(0, minutes - 1))}.`);
              });
            }}
          >
            −1 min
          </button>
        )}
        {habit.kind === 'timed' && done && (
          <button
            type="button"
            className={quietButton}
            aria-label={`Add 1 minute to ${habit.name}${suffix}`}
            onClick={() => void run(async () => {
              await habitLogRepo.add({ habitId: habit.id, date, minutes: 1, delta: null, source: 'manual' });
              onLive(`${habit.name}, ${formatMinuteAmount(minutes + 1)}.`);
            })}
          >
            +1 min
          </button>
        )}
        {habit.kind === 'count' && (
          <button
            type="button"
            className={done ? quietButton : 'rounded-full px-3 min-h-11 text-sm text-text-muted disabled:opacity-40'}
            aria-disabled={count <= 0}
            aria-label={count <= 0 ? `Remove 1 ${habit.unit ?? ''} from ${habit.name}${suffix}, none logged` : `Remove 1 ${habit.unit ?? ''} from ${habit.name}${suffix}`}
            onClick={() => {
              if (count <= 0) return;
              void run(async () => {
                await habitLogRepo.decrementManualCount(habit.id, date);
                onLive(`${habit.name}, ${Math.max(0, count - 1)} of ${target} ${habit.unit ?? ''}.`);
              });
            }}
          >
            −1
          </button>
        )}
        {habit.kind === 'count' && done && (
          <button
            type="button"
            className={quietButton}
            aria-label={`Add 1 ${habit.unit ?? ''} to ${habit.name}${suffix}`}
            onClick={() => void run(async () => {
              await habitLogRepo.add({ habitId: habit.id, date, minutes: null, delta: 1, source: 'manual' });
              onLive(`${habit.name}, ${count + 1} of ${target} ${habit.unit ?? ''}.`);
            })}
          >
            +1
          </button>
        )}
        {sessionOnly && complete && <span className="text-xs text-text-muted">From a session</span>}
      </div>
    </div>
  );
}
