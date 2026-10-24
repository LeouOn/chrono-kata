'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useFlag } from '@/hooks/useFlags';
import { useTasks } from '@/hooks/useTasks';
import { useSettings } from '@/hooks/useSettings';
import { resolveWakingHours } from '@/lib/planning/resolve';
import { useMemo } from 'react';
import { usePlanToday, useTodayKey } from '@/hooks/usePlanning';
import { useDayBlocks } from '@/hooks/useTimeline';
import { wakingWindow } from '@/lib/planning/time';
import { useNow } from '@/hooks/useNow';
import { useSessionLauncher } from '@/components/session/SessionLauncher';
import { DEFAULT_PICK_MINUTES } from '@/lib/planning/overcommit';

/**
 * Today's confirmed picks on the home page (roadmap Wave 6), behind the
 * `taskInbox` flag. With the flag off it renders nothing, so the practice home
 * page is unchanged. A task completed elsewhere simply drops out.
 */
export function TodayPlanCard() {
  const enabled = useFlag('taskInbox');
  const dayKey = useTodayKey();
  const { dayPlan, capacity } = usePlanToday(dayKey);
  const { data: tasks = [] } = useTasks({ enabled });
  const { settings } = useSettings();
  const wakingHours = useMemo(() => resolveWakingHours(settings), [settings]);
  const { data: blocks = [] } = useDayBlocks(dayKey);
  const sessionLauncher = useSessionLauncher();
  const now = useNow();
  // The block query covers two days so outside-window commitments stay visible
  // on the timeline; the Today strip must only speak about TODAY. An overnight
  // window reaches into tomorrow morning, so overlap is the right test.
  const todayWindow = useMemo(() => wakingWindow(dayKey, wakingHours), [dayKey, wakingHours]);

  if (!enabled) return null;

  const taskById = new Map(tasks.map((task) => [task.id, task] as const));
  const picks = (dayPlan?.picks ?? [])
    .map((id) => taskById.get(id))
    .filter((task): task is NonNullable<typeof task> => task !== undefined && task.status !== 'done' && task.status !== 'dropped');

  const focusWithTask = blocks
    .filter(
      (block) =>
        block.kind === 'focus' &&
        block.taskId &&
        taskById.has(block.taskId) &&
        block.start.getTime() < todayWindow.end &&
        block.end.getTime() > todayWindow.start,
    )
    .filter((block) => {
      const task = taskById.get(block.taskId!);
      return task && task.status !== 'done' && task.status !== 'dropped';
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const current = focusWithTask.find((block) => block.start.getTime() <= now && now < block.end.getTime());
  const next = focusWithTask.find((block) => block.start.getTime() > now);
  const clock = (date: Date) =>
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-wide text-text-muted">Today&apos;s plan</h2>
        <div className="flex items-center gap-3">
          <Link href="/timeline" className="text-xs text-accent min-h-11 flex items-center">
            Timeline
          </Link>
          <Link href="/plan" className="text-xs text-accent min-h-11 flex items-center">
            {picks.length > 0 ? 'Adjust' : 'Plan your day'}
          </Link>
        </div>
      </div>

      {current ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-accent/10 px-3 py-2">
          <p className="text-sm text-text min-w-0">
            <span className="text-[11px] uppercase tracking-wide text-text-muted">Now · until {clock(current.end)} </span>
            <span className="block truncate">{taskById.get(current.taskId!)?.title}</span>
          </p>
          <Button
            variant="ghost"
            className="shrink-0 min-h-11 px-3 text-sm border border-border"
            aria-label={`Start now: ${taskById.get(current.taskId!)?.title}`}
            onClick={() =>
              sessionLauncher.openForLink({
                taskId: current.taskId!,
                label: (taskById.get(current.taskId!)?.nextAction || taskById.get(current.taskId!)?.title || 'Focus').slice(0, 50),
                estimateMin: Math.round((current.end.getTime() - current.start.getTime()) / 60_000),
              })
            }
          >
            Start
          </Button>
        </div>
      ) : next ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
          <p className="text-sm text-text min-w-0">
            <span className="text-[11px] uppercase tracking-wide text-text-muted">Next · {clock(next.start)} </span>
            <span className="block truncate">{taskById.get(next.taskId!)?.title}</span>
          </p>
          <Button
            variant="ghost"
            className="shrink-0 min-h-11 px-3 text-sm border border-border"
            aria-label={`Start next: ${taskById.get(next.taskId!)?.title}`}
            onClick={() =>
              sessionLauncher.openForLink({
                taskId: next.taskId!,
                label: (taskById.get(next.taskId!)?.nextAction || taskById.get(next.taskId!)?.title || 'Focus').slice(0, 50),
                estimateMin: Math.round((next.end.getTime() - next.start.getTime()) / 60_000),
              })
            }
          >
            Start
          </Button>
        </div>
      ) : null}

      {picks.length === 0 ? (
        <p className="text-sm text-text-muted">
          {dayPlan
            ? dayPlan.picks.length === 0
              ? 'You left today unpicked.'
              : 'All of today’s picks are done.'
            : 'Nothing picked yet.'}
        </p>
      ) : (
        <ul className="space-y-2 pr-14">
          {picks.map((task) => (
            <li key={task.id} className="space-y-1">
              <p className="text-sm text-text break-words">{task.title}</p>
              <p className="text-[11px] text-text-muted">
                {task.estimateMin != null ? `~${task.estimateMin}m` : ''}
                {task.actualMin ? `${task.estimateMin != null ? ' · ' : ''}${task.actualMin}m logged` : ''}
              </p>
              {/* Full-width Start under the title: right-aligned buttons sit
                  behind the fixed practice FAB at phone width. */}
              <Button
                variant="ghost"
                className="w-full min-h-11 px-3 text-sm border border-border"
                aria-label={`Start a session for ${task.title}`}
                onClick={() =>
                  sessionLauncher.openForLink({
                    taskId: task.id,
                    label: (task.nextAction || task.title).slice(0, 50),
                    estimateMin: task.estimateMin ?? null,
                  })
                }
              >
                Start
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-text-muted">
        {dayPlan
          ? picks.length > 0
            ? `Room for ${dayPlan.capacityMin} minutes today; these picks come to about ${picks.reduce(
                (sum, task) => sum + (task.estimateMin ?? DEFAULT_PICK_MINUTES),
                0,
              )}.`
            : `Room for ${dayPlan.capacityMin} minutes today.`
          : 'Confirm your picks to see them here all day.'}
      </p>
    </Card>
  );
}
