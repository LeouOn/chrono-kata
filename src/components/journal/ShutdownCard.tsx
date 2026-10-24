'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { decisionsFor, outcomeOf, shutdownSummary, useJournalWrites } from '@/hooks/useJournal';
import { SHUTDOWN_NOTE_MAX, FIRST_ACTION_MAX } from '@/lib/journal/template';
import type { DayPlan } from '@/lib/schemas/day-plan';
import type { Task } from '@/lib/schemas/task';
import type { ShutdownOutcome } from '@/lib/journal/shutdown';

interface Props {
  dayKey: string;
  plan: DayPlan | null;
  tasks: Task[];
  domains: { id: string; name: string }[];
  domainChecks: Record<string, boolean>;
}

/** HH:MM for a stored instant, in the device's local clock. */
function clockOf(date: Date | null | undefined): string {
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The evening shutdown.
 *
 * Every pick gets one of two calm outcomes: it moved (done), or it is **back on
 * the list**. Nothing is called late, missed or failed, and nothing is deleted.
 * Closing the day writes the task statuses and the day row in one transaction;
 * a second close with the same choices changes nothing, which is why the button
 * becomes "Save changes" afterwards.
 */
export function ShutdownCard({ dayKey, plan, tasks, domains, domainChecks }: Props) {
  const { applyShutdown } = useJournalWrites();
  const [choices, setChoices] = useState<Record<string, ShutdownOutcome | undefined>>({});
  const [note, setNote] = useState(plan?.shutdownNote ?? '');
  const [firstAction, setFirstAction] = useState(plan?.firstActionTomorrow ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guardRef = useRef(false);

  const picks = plan?.picks ?? [];
  const taskById = new Map(tasks.map((task) => [task.id, task] as const));
  const closed = plan?.shutdownAt != null;

  // Seed the choices from what is stored, so reopening the screen shows the
  // decisions that were already made rather than a blank slate.
  useEffect(() => {
    const seeded: Record<string, ShutdownOutcome | undefined> = {};
    for (const taskId of picks) seeded[taskId] = outcomeOf(plan, taskId) ?? undefined;
    setChoices(seeded);
    setNote(plan?.shutdownNote ?? '');
    setFirstAction(plan?.firstActionTomorrow ?? '');
  }, [plan, picks.join(',')]);

  function choose(taskId: string, outcome: ShutdownOutcome) {
    setChoices((current) => ({ ...current, [taskId]: current[taskId] === outcome ? undefined : outcome }));
    setStatus(null);
  }

  async function closeDay() {
    if (guardRef.current) return;
    guardRef.current = true;
    setError(null);
    setStatus(null);
    try {
      const saved = await applyShutdown.mutateAsync({
        date: dayKey,
        decisions: decisionsFor(picks, choices),
        shutdownNote: note,
        firstActionTomorrow: firstAction,
        domainChecks,
      });
      setStatus(shutdownSummary(saved));
    } catch (e) {
      setError(
        e instanceof Error && e.message ? e.message : 'Nothing was saved. Check the fields and try again.',
      );
    } finally {
      guardRef.current = false;
    }
  }

  return (
    <section aria-labelledby="shutdown-heading" className="space-y-3">
      <div>
        <h2 id="shutdown-heading" className="font-serif text-lg text-text">
          Close the day
        </h2>
        <p className="text-xs text-text-muted">
          Anything you did not finish simply goes back on the list. Nothing is deleted, and the day keeps its record.
        </p>
      </div>

      {picks.length === 0 ? (
        <p className="text-sm text-text-muted">No picks for this day, so there is nothing to close.</p>
      ) : (
        <ul className="space-y-3">
          {picks.map((taskId) => {
            const task = taskById.get(taskId);
            const choice = choices[taskId] ?? (task?.status === 'done' ? 'done' : undefined);
            return (
              <li key={taskId} className="rounded-2xl border border-border bg-surface p-3">
                <p className="break-words text-sm text-text">{task?.title ?? 'This task is no longer here.'}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant={choice === 'done' ? 'primary' : 'ghost'}
                    className="min-h-11"
                    aria-pressed={choice === 'done'}
                    aria-label={`Done: “${task?.title ?? taskId}”`}
                    onClick={() => choose(taskId, 'done')}
                  >
                    Done
                  </Button>
                  <Button
                    variant={choice === 'back' ? 'primary' : 'ghost'}
                    className="min-h-11"
                    aria-pressed={choice === 'back'}
                    aria-label={`Back on the list: “${task?.title ?? taskId}”`}
                    onClick={() => choose(taskId, 'back')}
                  >
                    Back on the list
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <label className="block text-xs text-text-muted" htmlFor="shutdown-note">
          Shutdown note
        </label>
        <textarea
          id="shutdown-note"
          value={note}
          maxLength={SHUTDOWN_NOTE_MAX}
          rows={3}
          onChange={(event) => setNote(event.target.value.slice(0, SHUTDOWN_NOTE_MAX))}
          className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-3 text-text"
        />
        <p className="text-right text-[11px] text-text-muted">
          {note.length} / {SHUTDOWN_NOTE_MAX}
        </p>
      </div>

      <div>
        <label className="block text-xs text-text-muted" htmlFor="first-action">
          Tomorrow&apos;s first move
        </label>
        <input
          id="first-action"
          value={firstAction}
          maxLength={FIRST_ACTION_MAX}
          onChange={(event) => setFirstAction(event.target.value.slice(0, FIRST_ACTION_MAX))}
          className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3 py-3 text-text"
          placeholder="One line: the first small step tomorrow"
        />
      </div>

      {domains.length > 0 ? (
        <p className="text-xs text-text-muted">
          Domains ticked in the journal: {domains.filter((domain) => domainChecks[domain.id]).map((domain) => domain.name).join(', ') || 'none yet'}.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button className="min-h-11" onClick={() => void closeDay()}>
          {closed ? 'Save changes' : 'Close the day'}
        </Button>
        {closed ? (
          <span className="text-xs text-text-muted">Closed at {clockOf(plan?.shutdownAt)}</span>
        ) : null}
      </div>
      {status ? (
        <p role="status" className="text-xs text-text-muted">
          {status}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text">
          {error}
        </p>
      ) : null}
    </section>
  );
}
