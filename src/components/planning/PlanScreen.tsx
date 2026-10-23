'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/hooks/useToast';
import { useTasks } from '@/hooks/useTasks';
import { useConfirmDayPlan, usePlanToday, useTodayKey } from '@/hooks/usePlanning';
import { checkOvercommit, DEFAULT_PICK_MINUTES } from '@/lib/planning/overcommit';
import type { Task } from '@/lib/schemas/task';
import type { RankedPick } from '@/lib/planning/rank-picks';

interface Props {
  /** Injected for tests; defaults to the live local day. */
  dayKey?: string;
}

function capacitySentence(capacity: { wakingMin: number; fixedMin: number; anchorMin: number; bufferMin: number; capacityMin: number }): string {
  const occupied = capacity.fixedMin + capacity.anchorMin;
  if (capacity.capacityMin === 0) {
    return 'There is no room left for picks today. That is a normal kind of day.';
  }
  return `You have ${capacity.capacityMin} minutes for picks today: ${capacity.wakingMin} awake, minus ${occupied} for fixed or protected time, minus a ${capacity.bufferMin}-minute buffer.`;
}

/**
 * The plan screen (roadmap Wave 6): capacity, the suggested 1–3 picks with
 * their reasons, and the user's decision. Nothing is written until Confirm.
 */
export function PlanScreen({ dayKey: injectedDayKey }: Props) {
  const liveDay = useTodayKey();
  const dayKey = injectedDayKey ?? liveDay;
  const { enabled, capacity, picks, dayPlan, isLoading } = usePlanToday(dayKey);
  const { data: tasks = [] } = useTasks({ enabled });
  const { mutateAsync: confirmPlan } = useConfirmDayPlan(dayKey);
  const toast = useToast();

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task] as const)), [tasks]);
  const [draftIds, setDraftIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  // The confirmed plan wins when there is one; otherwise the suggestions. This
  // is DERIVED until the user edits, so arriving data cannot freeze a
  // half-loaded list into the draft (a real race found while testing).
  const confirmedIds = (dayPlan?.picks ?? []).filter((id) => taskById.has(id));
  const suggestedIds = picks.map((pick) => pick.task.id);
  const effectiveIds =
    draftIds ?? (isLoading ? [] : confirmedIds.length > 0 ? confirmedIds : suggestedIds);

  function updateDraft(mutator: (ids: string[]) => string[]) {
    setDraftIds(mutator(effectiveIds));
  }

  // The day rolled over while this screen was open: start again from that day.
  useEffect(() => {
    setDraftIds(null);
  }, [dayKey]);

  const draftTasks = effectiveIds
    .map((id) => taskById.get(id))
    .filter((task): task is Task => task !== undefined);
  const reasonsById = new Map(picks.map((pick: RankedPick) => [pick.task.id, pick.reasons] as const));
  const nextTasks = tasks.filter((task) => task.status === 'next');
  const candidates = nextTasks.filter((task) => !effectiveIds.includes(task.id));
  const overcommit = checkOvercommit(
    draftTasks.map((task) => ({ estimateMin: task.estimateMin ?? DEFAULT_PICK_MINUTES })),
    capacity.capacityMin,
  );

  function replaceAt(index: number, taskId: string) {
    updateDraft((ids) => ids.map((id, position) => (position === index ? taskId : id)));
  }

  function removeAt(index: number) {
    updateDraft((ids) => ids.filter((_, position) => position !== index));
  }

  function addTask(taskId: string) {
    updateDraft((ids) => (ids.length >= 3 ? ids : [...ids, taskId]));
  }

  async function onConfirm() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await confirmPlan({ picks: effectiveIds, capacityMin: capacity.capacityMin });
      toast.show('Plan saved for today.', 'success');
      setDraftIds(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the plan.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!enabled) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-2xl text-text">Plan</h1>
        <p className="text-sm text-text-muted">Planning is a preview feature. Turn it on in Settings.</p>
      </div>
    );
  }

  const confirmed = dayPlan != null;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-text mb-1">Plan</h1>
          <p className="text-xs text-text-muted">{dayKey}</p>
        </div>
        <Link href="/" className="text-xs text-accent min-h-11 flex items-center">
          Home
        </Link>
      </div>

      <Card className="space-y-1">
        <h2 className="text-xs uppercase tracking-wide text-text-muted">Your day</h2>
        <p className="text-sm text-text">{capacitySentence(capacity)}</p>
        {capacity.capacityMin > 0 ? (
          <p className="text-[11px] text-text-muted">
            {capacity.capacityMin} min capacity · {capacity.wakingMin} awake · {capacity.fixedMin} fixed ·{' '}
            {capacity.anchorMin} protected · {capacity.bufferMin} buffer
          </p>
        ) : null}
      </Card>

      <section className="space-y-2" aria-labelledby="picks-heading">
        <h2 id="picks-heading" className="text-xs uppercase tracking-wide text-text-muted">
          {confirmed ? 'Your picks' : 'Suggested for today'}
        </h2>

        {draftTasks.length === 0 ? (
          <Card>
            <p className="text-sm text-text">No picks yet.</p>
            <p className="text-xs text-text-muted mt-1">
              Add one below, or leave today unpicked. That is allowed.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {draftTasks.map((task, index) => (
              <li key={task.id}>
                <Card className="space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-text break-words">{task.title}</p>
                      <p className="text-[11px] text-text-muted">
                        {task.estimateMin != null ? `~${task.estimateMin}m` : `~${DEFAULT_PICK_MINUTES}m`}
                        {task.energy ? ` · ${task.energy} energy` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 px-3 text-sm"
                      aria-label={`Remove ${task.title} from today's picks`}
                      onClick={() => removeAt(index)}
                      disabled={saving}
                    >
                      Remove
                    </Button>
                  </div>
                  {(reasonsById.get(task.id) ?? []).length > 0 ? (
                    <p className="text-[11px] text-text-muted">{reasonsById.get(task.id)!.join(' · ')}</p>
                  ) : null}
                  <div>
                    <label
                      htmlFor={`swap-${task.id}`}
                      className="text-[11px] text-text-muted block mb-1"
                    >
                      Swap for another task
                    </label>
                    <select
                      id={`swap-${task.id}`}
                      value=""
                      onChange={(event) => {
                        if (event.target.value) replaceAt(index, event.target.value);
                      }}
                      disabled={saving}
                      className="w-full bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border outline-none min-h-11"
                    >
                      <option value="">Keep {task.title}</option>
                      {candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {draftTasks.length < 3 ? (
          <div>
            <label htmlFor="add-pick" className="text-[11px] text-text-muted block mb-1">
              Add a task by hand
            </label>
            <select
              id="add-pick"
              value=""
              onChange={(event) => {
                if (event.target.value) addTask(event.target.value);
              }}
              disabled={saving}
              className="w-full bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border outline-none min-h-11"
            >
              <option value="">Choose a next task…</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <p className="text-sm text-text-muted" role="status">
          {overcommit.message}
        </p>

        {error ? (
          <p role="alert" className="text-sm text-hype">
            {error}
          </p>
        ) : null}

        <Button onClick={() => void onConfirm()} disabled={saving} className="w-full min-h-11">
          {saving ? 'Saving…' : confirmed ? 'Update today’s plan' : 'Confirm today’s picks'}
        </Button>
      </section>
    </div>
  );
}
