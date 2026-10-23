'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import { useInbox } from '@/hooks/useTasks';
import { INBOX_OUTCOMES, outcomeForKey, type InboxOutcome } from '@/lib/tasks/outcomes';
import type { Task } from '@/lib/schemas/task';

type Step = 'choose' | 'next-action' | 'schedule' | 'make-project';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Turn a validation error into one sentence instead of raw Zod JSON. */
function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    const first = issues?.find((issue) => typeof issue.message === 'string' && issue.message !== '');
    if (first?.message) return first.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromLocalDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * One inbox item at a time, one of six outcomes (1-6), skip with `s`.
 * Nothing here uses red or overdue language; dropping is easy and undoable.
 */
export function ProcessMode({ open, onClose }: Props) {
  const { inbox, isLoading, triage, undo } = useInbox();
  const toast = useToast();

  // Snapshot the queue when the sheet opens, so the list does not shift under
  // the user while the inbox query refreshes after each decision.
  // Ids handled in this session (triaged or skipped). The queue itself is
  // derived from the live inbox, so an item captured while the sheet is open
  // still appears instead of being missed by a frozen snapshot.
  const [seen, setSeen] = useState<string[]>([]);
  const [step, setStep] = useState<Step>('choose');
  const [nextAction, setNextAction] = useState('');
  const [day, setDay] = useState(toDateInputValue(new Date()));
  const [lastAction, setLastAction] = useState<{ task: Task; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextActionRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  // Which outcome button opened the current step, so Back can re-focus it
  // after the step's input unmounts (the node itself is not kept).
  const stepBackOutcome = useRef<string | null>(null);

  useEffect(() => {
    if (open) return;
    setSeen([]);
    setStep('choose');
    setError(null);
    setLastAction(null);
    setNextAction('');
  }, [open]);

  const seenSet = new Set(seen);
  const remaining = inbox.filter((task) => !seenSet.has(task.id));
  const current = remaining[0] ?? null;
  const total = seen.length + remaining.length;
  const progress = current ? `${seen.length + 1} of ${total}` : '';
  const leftAfter = Math.max(0, remaining.length - 1);

  const advance = () => {
    if (!current) return;
    setSeen((ids) => (ids.includes(current.id) ? ids : [...ids, current.id]));
    setStep('choose');
    setError(null);
    setNextAction('');
  };

  async function apply(outcome: InboxOutcome, input?: { nextAction?: string; deferUntil?: Date }) {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      await triage({ task: current, outcome, input });
      if (outcome === 'do-now' || outcome === 'drop') {
        setLastAction({
          task: current,
          label: outcome === 'do-now' ? 'Done' : 'Dropped',
        });
      } else {
        setLastAction(null);
      }
      advance();
      toast.show(
        outcome === 'do-now'
          ? 'Done.'
          : outcome === 'drop'
            ? 'Dropped. It is out of the inbox.'
            : outcome === 'waiting'
              ? 'Moved to waiting.'
              : outcome === 'make-project'
                ? 'Project created and linked.'
                : 'Moved on.',
        'success',
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  function backToChoose() {
    setStep('choose');
    setError(null);
    // The focused input is about to unmount, so return focus to the outcome
    // button the user came from instead of dropping it on <body>.
    const id = stepBackOutcome.current;
    window.setTimeout(() => {
      if (id) (document.getElementById(`outcome-${id}`) as HTMLButtonElement | null)?.focus();
    }, 0);
  }

  function choose(outcome: InboxOutcome) {
    if (outcome === 'next-action') {
      stepBackOutcome.current = 'next-action';
      setStep('next-action');
      setError(null);
      return;
    }
    if (outcome === 'schedule') {
      stepBackOutcome.current = 'schedule';
      setStep('schedule');
      setError(null);
      return;
    }
    if (outcome === 'make-project') {
      setStep('make-project');
      setError(null);
      return;
    }
    void apply(outcome);
  }

  useEffect(() => {
    if (!open || step === 'next-action') nextActionRef.current?.focus();
    if (!open || step === 'schedule') dayRef.current?.focus();
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (step === 'choose') {
        const outcome = outcomeForKey(event.key);
        if (outcome && !typing) {
          event.preventDefault();
          choose(outcome);
        } else if (event.key.toLowerCase() === 's' && !typing) {
          event.preventDefault();
          advance();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `choose` closes over current state; the handler is intentionally re-bound
    // on those changes.
  }, [open, step, current, busy]);

  async function undoLast() {
    if (!lastAction) return;
    try {
      await undo(lastAction.task.id);
      setSeen((ids) => ids.filter((id) => id !== lastAction.task.id));
      setLastAction(null);
      toast.show('Back in the inbox.', 'info');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Process inbox">
      <div className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-text-muted" role="status">
            Loading inbox…
          </p>
        ) : current ? (
          <>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span aria-live="polite">{progress}</span>
              <span>{leftAfter} left after this</span>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="font-serif text-lg text-text break-words">{current.title}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-text-muted">
                {current.estimateMin ? <span>~{current.estimateMin}m</span> : null}
                {current.energy ? <span>{current.energy} energy</span> : null}
                {current.deferUntil ? (
                  <span>from {toDateInputValue(current.deferUntil)}</span>
                ) : null}
                {(current.context ?? []).map((context) => (
                  <span key={context}>@{context}</span>
                ))}
              </div>
            </div>

            {step === 'choose' ? (
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Triage outcomes">
                {INBOX_OUTCOMES.map((spec) => (
                  <Button
                    key={spec.outcome}
                    id={`outcome-${spec.outcome}`}
                    variant={spec.outcome === 'drop' ? 'ghost' : 'primary'}
                    className="justify-start text-left min-h-11"
                    onClick={() => choose(spec.outcome)}
                    disabled={busy}
                    aria-label={`${spec.key}: ${spec.label}. ${spec.hint}`}
                  >
                    <span className="mr-2 font-serif text-text-muted">{spec.key}</span>
                    <span className="flex flex-col">
                      <span className="text-sm">{spec.label}</span>
                      <span className="text-[11px] text-text-muted">{spec.hint}</span>
                    </span>
                  </Button>
                ))}
              </div>
            ) : null}

            {step === 'next-action' ? (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void apply('next-action', { nextAction });
                }}
              >
                <label className="block text-sm text-text" htmlFor="next-action-input">
                  The next small step
                </label>
                <input
                  id="next-action-input"
                  ref={nextActionRef}
                  value={nextAction}
                  onChange={(event) => setNextAction(event.target.value)}
                  maxLength={500}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-text min-h-11"
                  placeholder="e.g. find the warranty email"
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy || nextAction.trim() === ''}>
                    Save next action
                  </Button>
                  <Button type="button" variant="ghost" onClick={backToChoose}>
                    Back
                  </Button>
                </div>
              </form>
            ) : null}

            {step === 'schedule' ? (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const parsed = fromLocalDateInput(day);
                  if (parsed) void apply('schedule', { deferUntil: parsed });
                }}
              >
                <label className="block text-sm text-text" htmlFor="schedule-input">
                  Day to look at it again
                </label>
                <input
                  id="schedule-input"
                  ref={dayRef}
                  type="date"
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-text min-h-11"
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy || fromLocalDateInput(day) === null}>
                    Schedule
                  </Button>
                  <Button type="button" variant="ghost" onClick={backToChoose}>
                    Back
                  </Button>
                </div>
              </form>
            ) : null}

            {step === 'make-project' ? (
              <div className="space-y-2">
                <p className="text-sm text-text">
                  Create a project from “{current.title}” and keep it as the first next action?
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => void apply('make-project')} disabled={busy}>
                    Make project
                  </Button>
                  <Button variant="ghost" onClick={backToChoose}>
                    Back
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={advance} disabled={busy || step !== 'choose'}>
                Skip for now
                <span className="ml-2 text-[11px] text-text-muted">s</span>
              </Button>
              {lastAction ? (
                <Button variant="ghost" onClick={() => void undoLast()} disabled={busy}>
                  Undo {lastAction.label.toLowerCase()}
                </Button>
              ) : null}
            </div>

            {error ? (
              <p role="alert" className="text-sm text-hype">
                {error}
              </p>
            ) : null}
          </>
        ) : (
          <div className="space-y-3 text-center py-6">
            <p className="font-serif text-lg text-text">Inbox is clear.</p>
            <p className="text-sm text-text-muted">Nothing is waiting to be sorted.</p>
            <Button onClick={onClose}>Close</Button>
            {lastAction ? (
              <Button variant="ghost" onClick={() => void undoLast()}>
                Undo {lastAction.label.toLowerCase()}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </Modal>
  );
}
