'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { addDays, daysBetweenDayKeys } from '@/lib/pacing/days';
import { NEXT_ACTION_MAX } from '@/lib/review/limits';
import type { SweepDecision } from '@/lib/review/decisions';
import type { Task } from '@/lib/schemas/task';
import { toLocalDateString } from '@/lib/utils/date';

interface Props {
  tasks: Task[];
  decisions: Record<string, SweepDecision>;
  now: Date;
  busy: boolean;
  /** Apply and record one decision. The wizard owns the repository write. */
  onDecide: (taskId: string, decision: SweepDecision) => Promise<void>;
  onUndo: (taskId: string) => Promise<void>;
}

/** How long a task has been untouched, in local calendar days. */
function untouchedDays(task: Task, now: Date): number {
  return Math.max(0, daysBetweenDayKeys(toLocalDateString(task.touchedAt), toLocalDateString(now)));
}

function DecisionNote({
  decision,
  onUndo,
  busy,
}: {
  decision: SweepDecision;
  onUndo: () => void;
  busy: boolean;
}) {
  if (decision.action === 'keep') return <p className="text-xs text-text-muted">Kept as it is.</p>;
  if (decision.action === 'redefine')
    return <p className="text-xs text-text-muted">Next: {decision.nextAction}</p>;
  if (decision.action === 'defer')
    return <p className="text-xs text-text-muted">Deferred to {decision.deferUntil}.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-xs text-text-muted">Let go. Nothing was deleted.</p>
      <Button variant="ghost" className="min-h-11" onClick={onUndo} disabled={busy}>
        Undo let go
      </Button>
    </div>
  );
}

/**
 * Step 2 of the review: the tasks that have been waiting. Four calm choices per
 * task — keep, name the next small step, defer, or let it go. Every choice is
 * applied immediately (one repository write) and is recorded in the draft, so a
 * paused review reopens with the same rows and the same decisions.
 */
export function WaitingStep({ tasks, decisions, now, busy, onDecide, onUndo }: Props) {
  const [mode, setMode] = useState<Record<string, 'next-action' | 'defer' | undefined>>({});
  const [nextAction, setNextAction] = useState<Record<string, string>>({});
  const [day, setDay] = useState<Record<string, string>>({});
  const todayKey = toLocalDateString(now);

  if (tasks.length === 0) {
    return (
      <Card>
        <p className="font-serif text-lg text-text">Nothing has been waiting long.</p>
        <p className="mt-1 text-sm text-text-muted">
          Tasks appear here after two weeks without a touch, so the week keeps its shape without being nudged.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        These next actions have not been touched for two weeks or more. Keep the ones that still matter, reshape the
        ones that feel too big, and let go of the rest.
      </p>
      {tasks.map((task) => {
        const decision = decisions[task.id];
        const rowMode = mode[task.id];
        const days = untouchedDays(task, now);
        return (
          <Card key={task.id}>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words font-serif text-base text-text">{task.title}</p>
              <span className="shrink-0 text-xs text-text-muted">untouched {days} days</span>
            </div>
            {task.nextAction ? (
              <p className="mt-1 break-words text-xs text-text-muted">Pick up here: {task.nextAction}</p>
            ) : null}

            {rowMode === 'next-action' ? (
              <form
                className="mt-3 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = (nextAction[task.id] ?? '').trim();
                  if (value === '') return;
                  void onDecide(task.id, { action: 'redefine', nextAction: value.slice(0, NEXT_ACTION_MAX) });
                  setMode((current) => ({ ...current, [task.id]: undefined }));
                }}
              >
                <label className="block text-xs text-text-muted" htmlFor={`next-action-${task.id}`}>
                  The next small step for “{task.title}”
                </label>
                <input
                  id={`next-action-${task.id}`}
                  value={nextAction[task.id] ?? ''}
                  onChange={(event) =>
                    setNextAction((current) => ({ ...current, [task.id]: event.target.value }))
                  }
                  maxLength={NEXT_ACTION_MAX}
                  className="w-full min-h-11 rounded-xl border border-border bg-surface px-3 py-3 text-text"
                  placeholder="e.g. find the warranty email"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={busy || (nextAction[task.id] ?? '').trim() === ''}>
                    Save next step
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setMode((current) => ({ ...current, [task.id]: undefined }))}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}

            {rowMode === 'defer' ? (
              <form
                className="mt-3 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = day[task.id] ?? addDays(todayKey, 7);
                  void onDecide(task.id, { action: 'defer', deferUntil: value });
                  setMode((current) => ({ ...current, [task.id]: undefined }));
                }}
              >
                <label className="block text-xs text-text-muted" htmlFor={`defer-${task.id}`}>
                  Day to look at “{task.title}” again
                </label>
                <input
                  id={`defer-${task.id}`}
                  type="date"
                  value={day[task.id] ?? addDays(todayKey, 7)}
                  onChange={(event) => setDay((current) => ({ ...current, [task.id]: event.target.value }))}
                  className="w-full min-h-11 rounded-xl border border-border bg-surface px-3 py-3 text-text"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={busy}>
                    Defer
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setMode((current) => ({ ...current, [task.id]: undefined }))}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}

            {rowMode === undefined ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  className="min-h-11"
                  aria-label={`Keep “${task.title}” as it is`}
                  disabled={busy}
                  onClick={() => void onDecide(task.id, { action: 'keep' })}
                >
                  Keep
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  aria-label={`Name a new next step for “${task.title}”`}
                  disabled={busy}
                  onClick={() => setMode((current) => ({ ...current, [task.id]: 'next-action' }))}
                >
                  New next step
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  aria-label={`Defer “${task.title}”`}
                  disabled={busy}
                  onClick={() => setMode((current) => ({ ...current, [task.id]: 'defer' }))}
                >
                  Defer
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  aria-label={`Let go of “${task.title}”`}
                  disabled={busy}
                  onClick={() => void onDecide(task.id, { action: 'drop' })}
                >
                  Let it go
                </Button>
              </div>
            ) : null}

            {decision ? (
              <div className="mt-2">
                <DecisionNote decision={decision} onUndo={() => void onUndo(task.id)} busy={busy} />
              </div>
            ) : null}
          </Card>
        );
      })}
      <p className="text-xs text-text-muted">
        Letting go keeps the task in your data with the status `dropped`; it can come back at any time.
      </p>
    </div>
  );
}
