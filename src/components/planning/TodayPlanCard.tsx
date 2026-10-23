'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useFlag } from '@/hooks/useFlags';
import { useTasks } from '@/hooks/useTasks';
import { usePlanToday, useTodayKey } from '@/hooks/usePlanning';
import { useSessionLauncher } from '@/components/session/SessionLauncher';

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
  const sessionLauncher = useSessionLauncher();

  if (!enabled) return null;

  const taskById = new Map(tasks.map((task) => [task.id, task] as const));
  const picks = (dayPlan?.picks ?? [])
    .map((id) => taskById.get(id))
    .filter((task): task is NonNullable<typeof task> => task !== undefined && task.status !== 'done' && task.status !== 'dropped');

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-wide text-text-muted">Today&apos;s plan</h2>
        <Link href="/plan" className="text-xs text-accent min-h-11 flex items-center">
          {picks.length > 0 ? 'Adjust' : 'Plan your day'}
        </Link>
      </div>

      {picks.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nothing picked yet. {capacity.capacityMin > 0 ? `${capacity.capacityMin} minutes are available.` : ''}
        </p>
      ) : (
        <ul className="space-y-2">
          {picks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-text break-words">{task.title}</p>
                <p className="text-[11px] text-text-muted">
                  {task.estimateMin != null ? `~${task.estimateMin}m` : ''}
                  {task.actualMin ? `${task.estimateMin != null ? ' · ' : ''}${task.actualMin}m logged` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                className="min-h-11 px-3 text-sm border border-border"
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
        {dayPlan ? `${dayPlan.capacityMin} minutes planned for today.` : 'Confirm your picks to see them here all day.'}
      </p>
    </Card>
  );
}
