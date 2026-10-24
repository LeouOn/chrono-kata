'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { WizardProgress } from './WizardProgress';
import { InboxStep } from './InboxStep';
import { WaitingStep } from './WaitingStep';
import { ProjectsStep } from './ProjectsStep';
import { BalanceStep } from './BalanceStep';
import { EstimateStep } from './EstimateStep';
import { ShapeStep } from './ShapeStep';
import { useDomains } from '@/hooks/useDomains';
import { useProjects, useTasks } from '@/hooks/useTasks';
import { useSessions } from '@/hooks/useSessions';
import { useLatestDraft, useReview, useReviewWrites, useSaveProject, useSweepTask } from '@/hooks/useReview';
import { clampStep, REVIEW_STEPS, stepAt } from '@/lib/review/steps';
import { summarizeWeek } from '@/lib/review/stats';
import { formatWeekLabel, weekBefore, weekKeyFor } from '@/lib/review/week';
import {
  EMPTY_DECISIONS,
  isValidDeferDay,
  parseDecisions,
  serialiseDecisions,
  withProjectDecision,
  withSweep,
  withoutSweep,
  type ProjectDecision,
  type ReviewDecisions,
  type SweepDecision,
} from '@/lib/review/decisions';
import { localDayKeyToDate } from '@/lib/capture/task-input';
import { toLocalDateString } from '@/lib/utils/date';
import type { Project, ProjectInput } from '@/lib/schemas/project';
import type { Review, ReviewDraft } from '@/lib/schemas/review';
import type { Task } from '@/lib/schemas/task';

const SWEEP_FAILED = 'That change was not saved, so nothing was altered. Try again.';
const FINISH_FAILED = 'The review was not saved, so nothing was changed. Try again.';
const DRAFT_FAILED = 'This step could not be saved to the draft just now. Your decisions in the app are kept.';

/**
 * The weekly review wizard (roadmap Wave 11).
 *
 * Six optional steps over one reviewed week. Every decision is applied to the
 * store immediately and recorded in a `ReviewDraft`, so closing the page keeps
 * the progress and reopening resumes at the same step. Finishing writes the
 * `Review` and clears the draft in one transaction (see `reviewRepo.complete`).
 */
export function ReviewWizard() {
  const router = useRouter();
  const [now] = useState(() => new Date());
  const currentWeek = weekKeyFor(now);

  const { data: latestDraft, isLoading: draftLoading } = useLatestDraft();
  const { saveDraft, complete, discardDraft } = useReviewWrites();
  const sweepTask = useSweepTask();
  const saveProject = useSaveProject();

  const [weekOf, setWeekOf] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [decisions, setDecisions] = useState<ReviewDecisions>(EMPTY_DECISIONS);
  const [waitingSnapshot, setWaitingSnapshot] = useState<{ weekOf: string; ids: string[] } | null>(null);
  const [savedReview, setSavedReview] = useState<Review | null>(null);
  const [pastDraft, setPastDraft] = useState<ReviewDraft | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const finishingRef = useRef(false);
  const seededRef = useRef<string | null>(null);

  // Resume this week's draft silently. A draft from an earlier week is never
  // resumed behind the user's back: it would file a review under the wrong week
  // forever. The choice below lets them continue it, start this week, or let it go.
  useEffect(() => {
    if (weekOf !== null || draftLoading) return;
    if (!latestDraft) {
      setWeekOf(currentWeek);
      return;
    }
    if (latestDraft.weekOf !== currentWeek) {
      setPastDraft(latestDraft);
      setWeekOf(currentWeek);
      return;
    }
    setWeekOf(latestDraft.weekOf);
    setStep(clampStep(latestDraft.step));
    setDecisions(parseDecisions(latestDraft.decisions));
  }, [weekOf, draftLoading, latestDraft, currentWeek]);

  const activeWeek = weekOf ?? currentWeek;
  const { data: existingReview } = useReview(activeWeek);
  const { data: previousReview } = useReview(weekBefore(activeWeek));

  // A saved review for this week is the starting point for its notes and its
  // intentions, so "review again" does not look like it forgot last time.
  useEffect(() => {
    if (!existingReview || seededRef.current === existingReview.weekOf) return;
    seededRef.current = existingReview.weekOf;
    setDecisions((current) => ({
      ...current,
      notes: current.notes === '' ? existingReview.notes : current.notes,
      nextWeekIntentions:
        Object.keys(current.nextWeekIntentions).length > 0
          ? current.nextWeekIntentions
          : (existingReview.nextWeekIntentions ?? {}),
    }));
  }, [existingReview]);

  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: projects = [] } = useProjects();
  const { data: domains = [] } = useDomains();
  const { sessions } = useSessions();

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task] as const)), [tasks]);
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects],
  );

  const intentions = useMemo(
    () => ({ ...(previousReview?.nextWeekIntentions ?? {}), ...decisions.weekIntentions }),
    [previousReview, decisions.weekIntentions],
  );

  const stats = useMemo(
    () => summarizeWeek({ weekOf: activeWeek, sessions, tasks, projects, domains, intentions, now }),
    [activeWeek, sessions, tasks, projects, domains, intentions, now],
  );

  // Capture the waiting list when the step is entered, so a decision does not
  // make its own row vanish; decisions recorded in an earlier visit stay listed.
  useEffect(() => {
    if (step !== 1) return;
    // Wait for the tasks to arrive: a resume that lands on this step renders
    // once with an empty store, and snapshotting that would lock in an empty
    // list for the whole visit.
    if (tasksLoading) return;
    if (waitingSnapshot?.weekOf === activeWeek) return;
    setWaitingSnapshot({ weekOf: activeWeek, ids: stats.waitingTaskIds });
  }, [step, tasksLoading, waitingSnapshot, activeWeek, stats.waitingTaskIds]);

  const waitingIds = useMemo(() => {
    const ids = new Set<string>(waitingSnapshot?.weekOf === activeWeek ? waitingSnapshot.ids : []);
    for (const taskId of Object.keys(decisions.sweep)) ids.add(taskId);
    return [...ids].sort();
  }, [waitingSnapshot, activeWeek, decisions.sweep]);
  const waitingTasks = waitingIds
    .map((id) => taskById.get(id))
    .filter((task): task is Task => task !== undefined);

  const visibleProjects: Project[] = useMemo(() => {
    const order = new Map(stats.projects.map((row, index) => [row.projectId, index] as const));
    return projects
      .filter((project) => project.status === 'active' || project.status === 'paused')
      .sort(
        (a, b) =>
          (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
          a.title.localeCompare(b.title),
      );
  }, [projects, stats.projects]);

  const weekByProject = useMemo(
    () => new Map(stats.projects.map((row) => [row.projectId, row] as const)),
    [stats.projects],
  );

  const inboxCount = tasks.filter((task) => task.status === 'inbox').length;

  // The summary is about the reviewed week only; a session from another week is
  // not part of it, even when it is in the store.
  const weekSessions = useMemo(
    () =>
      sessions.filter((session) => {
        const at = session.startedAt.getTime();
        return at >= stats.weekStart && at < stats.weekEnd;
      }),
    [sessions, stats.weekStart, stats.weekEnd],
  );

  if (savedReview) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-2xl text-text">Review saved</h1>
        <Card>
          <p className="font-serif text-lg text-text">Week of {formatWeekLabel(savedReview.weekOf)}</p>
          <p className="mt-1 text-sm text-text-muted">
            {savedReview.notes.trim() === ''
              ? 'No notes this week — the numbers are stored with the review.'
              : savedReview.notes}
          </p>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-2xl bg-accent px-4 py-3 font-medium text-base"
          >
            Back to today
          </Link>
        </div>
      </div>
    );
  }

  if (pastDraft) {
    const draft = pastDraft;
    return (
      <div className="space-y-4">
        <header>
          <h1 className="font-serif text-2xl text-text">Weekly review</h1>
          <p className="text-sm text-text-muted">Today is in the week of {formatWeekLabel(currentWeek)}.</p>
        </header>
        <Card>
          <p className="font-serif text-lg text-text">
            You have an unfinished review for the week of {formatWeekLabel(draft.weekOf)}.
          </p>
          <p className="mt-1 text-sm text-text-muted">
            It is saved on this device at step {clampStep(draft.step) + 1} of {REVIEW_STEPS.length}. Continue it, or
            start this week&apos;s review.
          </p>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button
            className="min-h-11"
            onClick={() => {
              setWeekOf(draft.weekOf);
              setStep(clampStep(draft.step));
              setDecisions(parseDecisions(draft.decisions));
              setPastDraft(null);
            }}
          >
            Continue that review
          </Button>
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              setStep(0);
              setDecisions(EMPTY_DECISIONS);
              setPastDraft(null);
            }}
          >
            Start this week&apos;s review
          </Button>
        </div>
        <div className="border-t border-border pt-3">
          {confirmDiscard ? (
            <div className="space-y-2">
              <p className="text-sm text-text">Discard the unfinished review for the week of {formatWeekLabel(draft.weekOf)}? Nothing else is touched.</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => {
                    setDiscardError(null);
                    void (async () => {
                      try {
                        await discardDraft.mutateAsync(draft.weekOf);
                        setConfirmDiscard(false);
                        setPastDraft(null);
                        setStep(0);
                        setDecisions(EMPTY_DECISIONS);
                      } catch {
                        setDiscardError('That draft could not be discarded just now, so it is still here.');
                      }
                    })();
                  }}
                >
                  Discard it
                </Button>
                <Button variant="ghost" className="min-h-11" onClick={() => setConfirmDiscard(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" className="min-h-11" onClick={() => setConfirmDiscard(true)}>
              Discard the unfinished review
            </Button>
          )}
          {discardError ? (
            <p role="alert" className="mt-2 text-sm text-text">
              {discardError}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (weekOf === null) {
    return (
      <p role="status" className="text-sm text-text-muted">
        Opening your review…
      </p>
    );
  }

  const current = stepAt(step);

  async function persistDraft(nextStep: number, nextDecisions: ReviewDecisions) {
    if (weekOf === null) return;
    try {
      await saveDraft.mutateAsync({
        weekOf,
        step: nextStep,
        decisions: serialiseDecisions(nextDecisions),
      });
      setDraftError(null);
    } catch {
      setDraftError(DRAFT_FAILED);
    }
  }

  function goTo(nextStep: number) {
    const target = clampStep(nextStep);
    setStep(target);
    setError(null);
    void persistDraft(target, decisions);
  }

  /**
   * Store a decision that needs no repository write (intentions, notes) and
   * save it to the draft straight away, so closing the page — by the button or
   * by the browser — never loses the current step's typing.
   */
  function updateDecisions(next: ReviewDecisions) {
    setDecisions(next);
    void persistDraft(step, next);
  }

  async function applySweep(taskId: string, decision: SweepDecision) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (decision.action === 'keep') {
        // A deliberate keep refreshes the touch, so the same task does not ask
        // again next week while never leaving the next list.
        await sweepTask.mutateAsync({ taskId, status: 'next' });
      } else if (decision.action === 'redefine') {
        await sweepTask.mutateAsync({
          taskId,
          // Matches the inbox's `next-action` outcome: a named next step is a
          // `next` task with no stale defer date left on it.
          patch: { nextAction: decision.nextAction ?? null, deferUntil: null },
          status: 'next',
        });
      } else if (decision.action === 'defer') {
        const todayKey = toLocalDateString(now);
        if (!decision.deferUntil || !isValidDeferDay(decision.deferUntil, todayKey)) {
          // Last line of defence: the Defer button is disabled for an invalid
          // day, so the UI cannot reach this; the check stays so a future caller
          // still cannot write a scheduled task without a real day.
          setError('Pick a day from today onwards, then try again.');
          return;
        }
        await sweepTask.mutateAsync({
          taskId,
          patch: { deferUntil: localDayKeyToDate(decision.deferUntil) },
          status: 'scheduled',
        });
      } else {
        await sweepTask.mutateAsync({ taskId, status: 'dropped' });
      }
      const next = withSweep(decisions, taskId, decision);
      setDecisions(next);
      await persistDraft(step, next);
    } catch {
      setError(SWEEP_FAILED);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function undoLetGo(taskId: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await sweepTask.mutateAsync({ taskId, status: 'next' });
      const next = withoutSweep(decisions, taskId);
      setDecisions(next);
      await persistDraft(step, next);
    } catch {
      setError(SWEEP_FAILED);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function saveProjectPatch(
    projectId: string,
    patch: Partial<ProjectInput>,
    decision: ProjectDecision,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await saveProject.mutateAsync({ projectId, patch });
      const next = withProjectDecision(decisions, projectId, decision);
      setDecisions(next);
      await persistDraft(step, next);
    } catch {
      setError('That project change was not saved, so nothing was altered. Try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function saveCadence(projectId: string, cadence: number | null) {
    await saveProjectPatch(projectId, { cadencePerWeek: cadence }, {});
  }

  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const review = await complete.mutateAsync({
        weekOf: activeWeek,
        patch: {
          notes: decisions.notes.trim(),
          statsSnapshot: stats,
          nextWeekIntentions: decisions.nextWeekIntentions,
        },
      });
      setSavedReview(review);
    } catch {
      setError(FINISH_FAILED);
    } finally {
      finishingRef.current = false;
      setBusy(false);
    }
  }

  async function closeForNow() {
    await persistDraft(step, decisions);
    router.push('/');
  }

  const stepContent = () => {
    switch (current.id) {
      case 'inbox':
        return <InboxStep count={inboxCount} />;
      case 'waiting':
        return (
          <WaitingStep
            tasks={waitingTasks}
            decisions={decisions.sweep}
            now={now}
            busy={busy}
            onDecide={applySweep}
            onUndo={undoLetGo}
          />
        );
      case 'projects':
        return (
          <ProjectsStep
            projects={visibleProjects}
            weekByProject={weekByProject}
            decisions={decisions.projects}
            busy={busy}
            onSave={saveProjectPatch}
          />
        );
      case 'balance':
        return (
          <BalanceStep
            rows={stats.domainBalance}
            domains={domains}
            intentions={intentions}
            unassignedMinutes={stats.unassignedMinutes}
            onChange={(domainId, minutes) => {
              const weekIntentions = { ...decisions.weekIntentions };
              if (minutes === null) delete weekIntentions[domainId];
              else weekIntentions[domainId] = minutes;
              updateDecisions({ ...decisions, weekIntentions });
            }}
          />
        );
      case 'estimate':
        return <EstimateStep estimate={stats.estimateVsActual} />;
      case 'shape':
        return (
          <ShapeStep
            weekOf={activeWeek}
            domains={domains}
            projects={visibleProjects}
            intentions={decisions.nextWeekIntentions}
            notes={decisions.notes}
            sessions={weekSessions}
            busy={busy}
            onIntentionChange={(domainId, minutes) => {
              const nextWeekIntentions = { ...decisions.nextWeekIntentions };
              if (minutes === null) delete nextWeekIntentions[domainId];
              else nextWeekIntentions[domainId] = minutes;
              updateDecisions({ ...decisions, nextWeekIntentions });
            }}
            onCadenceChange={(projectId, cadence) => void saveCadence(projectId, cadence)}
            onNotesChange={(notes) => updateDecisions({ ...decisions, notes })}
          />
        );
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-serif text-2xl text-text">Weekly review</h1>
        <p className="text-sm text-text-muted">Week of {formatWeekLabel(activeWeek)}</p>
      </header>

      <WizardProgress step={step} />

      {error ? (
        <p role="alert" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text">
          {error}
        </p>
      ) : null}
      {draftError ? (
        <p role="status" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-muted">
          {draftError}
        </p>
      ) : null}

      <section aria-labelledby="review-step-title" className="space-y-3">
        <div>
          <h2 id="review-step-title" className="font-serif text-xl text-text">
            {current.title}
          </h2>
          <p className="text-sm text-text-muted">{current.hint}</p>
        </div>
        {stepContent()}
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button variant="ghost" className="min-h-11" onClick={() => goTo(step - 1)} disabled={step === 0 || busy}>
          Back
        </Button>
        {step < REVIEW_STEPS.length - 1 ? (
          <Button className="min-h-11" onClick={() => goTo(step + 1)} disabled={busy}>
            Next
          </Button>
        ) : (
          <Button className="min-h-11" onClick={() => void finish()} disabled={busy}>
            Finish review
          </Button>
        )}
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={() => void closeForNow()}
          disabled={busy}
        >
          Close for now
        </Button>
      </div>
      <p className="text-xs text-text-muted">
        Closing keeps your draft: the next visit resumes at this step. Nothing here is deleted, and every step can be
        left as it is.
      </p>
    </div>
  );
}
