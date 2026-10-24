'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { taskRepo } from '@/lib/db/task.repo';
import { useDecomposition, useInvalidateTasks } from '@/hooks/useDecomposition';
import {
  buildDecompositionSystemPrompt,
  buildDecompositionUserText,
  type DecompositionTaskInput,
} from '@/lib/decomposition/prompt';
import { DECOMPOSITION_FEATURE, type DecompositionMode } from '@/lib/decomposition/schema';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { resolveProviderFor } from '@/lib/llm/llm-service';
import { isLocalProvider } from '@/lib/llm/local-provider';
import { LLMException } from '@/lib/llm/types';
import type { Decomposition } from '@/lib/decomposition/schema';
import type { Task } from '@/lib/schemas/task';

interface Props {
  task: Task;
  /** Filled when the task has a project (what leaves the device names it). */
  projectTitle?: string;
  /** Which triggers to render; both by default. */
  triggers?: Array<DecompositionMode>;
}

/**
 * "Break it down" / "This feels heavy" sheet (roadmap W3). One hook instance,
 * one source of wire text (the prompt builders), one confirm guard.
 * Nothing AI-made is written without the Confirm click.
 */
export function DecomposeSheet({ task, projectTitle, triggers = ['break-it-down', 'this-feels-heavy'] }: Props) {
  const { open, run, error, start, send, close } = useDecomposition();
  const invalidate = useInvalidateTasks();
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [useAsNextAction, setUseAsNextAction] = useState(true);
  const confirmGuardRef = useRef(false);

  const taskRef = useRef(task);
  taskRef.current = task;

  function openFor(mode: DecompositionMode) {
    setCheckedSteps(new Set());
    setUseAsNextAction(true);
    confirmGuardRef.current = false;
    start(buildInput(task, projectTitle), mode, task.id);
  }

  const decomposition =
    run.result?.result.kind === 'ok' ? run.result.result.value : null;
  const fallbackText =
    run.result?.result.kind === 'fallback' ? run.result.result.value : null;
  const preview = usePreviewProvider(open);

  return (
    <>
      <div className="flex gap-1">
        {triggers.includes('break-it-down') && (
          <Button
            variant="ghost"
            className="min-h-11 px-3 text-sm"
            aria-label={`Break down ${task.title} with AI`}
            onClick={() => openFor('break-it-down')}
          >
            Break it down
          </Button>
        )}
        {triggers.includes('this-feels-heavy') && (
          <Button
            variant="ghost"
            className="min-h-11 px-3 text-sm"
            aria-label={`${task.title} feels heavy. Shrink its scope with AI`}
            onClick={() => openFor('this-feels-heavy')}
          >
            This feels heavy
          </Button>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => {
          confirmGuardRef.current = true; // a closed sheet confirms nothing
          close();
        }}
        title={run.mode === 'this-feels-heavy' ? 'This feels heavy' : 'Break it down'}
      >
        <div className="space-y-4">
          {run.phase === 'privacy' && (
            <>
              <p className="text-sm text-text">
                Before the first call — this is <strong>everything</strong> that
                would leave the device. No health data, no sessions, no history;
                only the task text below.
              </p>
              <div className="rounded-xl border border-border bg-surface-2 p-3">
                <p className="text-xs text-text-muted mb-1">Sent as the task:</p>
                <pre className="whitespace-pre-wrap text-xs text-text" data-testid="wire-user">
                  {buildDecompositionUserText(run.input)}
                </pre>
                <details className="mt-2">
                  <summary className="text-xs text-text-muted cursor-pointer min-h-11 flex items-center">
                    Also sent: the shared instruction
                  </summary>
                  <pre className="whitespace-pre-wrap text-xs text-text-muted mt-1" data-testid="wire-system">
                    {buildDecompositionSystemPrompt(run.mode)}
                  </pre>
                </details>
              </div>
              <p className="text-sm text-text" data-testid="wire-provider">
                {preview.state === 'ready'
                  ? `Goes to ${preview.providerName} (${preview.model}) — ${preview.local ? 'on this device' : 'a remote provider'}.`
                  : preview.message}
              </p>
              {error.kind === 'error' && (
                <p role="alert" className="text-sm text-text" data-testid="decompose-error">
                  {error.message}
                </p>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={preview.state !== 'ready'}
                  onClick={() => void send()}
                >
                  Send to {preview.state === 'ready' ? preview.providerName : 'provider'}
                </Button>
              </div>
            </>
          )}

          {run.phase === 'running' && (
            <p className="text-sm text-text-muted py-6 text-center" data-testid="decompose-running">
              Asking…
            </p>
          )}

          {run.phase === 'done' && run.result && (
            <div className="space-y-4">
              {decomposition ? (
                <>
                  <div className="rounded-xl border border-zen/50 bg-surface p-3">
                    <p className="text-xs uppercase tracking-wide text-text-muted mb-1">
                      First move · startable in 5 minutes
                    </p>
                    <p className="font-serif text-lg text-text" data-testid="first-action">
                      {decomposition.firstAction}
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      about {decomposition.firstActionMinutes} minute
                      {decomposition.firstActionMinutes === 1 ? '' : 's'}
                    </p>
                  </div>

                  <Section title="What it needs" items={decomposition.needs} />
                  <Section title="How this tends to go wrong" items={decomposition.pitfalls} />
                  <Section title="What you can skip or do badly" items={decomposition.canSkipOrDoBadly} />

                  {decomposition.steps && decomposition.steps.length > 0 && (
                    <details className="rounded-xl border border-border bg-surface-2 p-3">
                      <summary className="text-sm text-text cursor-pointer min-h-11 flex items-center">
                        Steps ({decomposition.steps.length}) — pick any to save as subtasks
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {decomposition.steps.map((step, i) => (
                          <li key={i}>
                            <label className="flex items-start gap-2 text-sm text-text">
                              <input
                                type="checkbox"
                                className="mt-0.5 size-6 shrink-0"
                                checked={checkedSteps.has(i)}
                                onChange={(e) =>
                                  setCheckedSteps((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(i);
                                    else next.delete(i);
                                    return next;
                                  })
                                }
                                aria-label={`Save step as subtask: ${step.title}`}
                              />
                              <span>
                                {step.title} <span className="text-text-muted">· {step.minutes}m</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <label className="flex items-center gap-2 text-sm text-text min-h-11">
                    <input
                      type="checkbox"
                      className="size-6 shrink-0"
                      checked={useAsNextAction}
                      onChange={(e) => setUseAsNextAction(e.target.checked)}
                      aria-label="Use the first move as this task's next action"
                    />
                    Use the first move as this task’s next action
                  </label>

                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" onClick={close}>
                      Save nothing
                    </Button>
                    <Button
                      variant="primary"
                      aria-label="Confirm and save only the picked items"
                      onClick={() => {
                        if (confirmGuardRef.current) return; // double-submit guard
                        confirmGuardRef.current = true;
                        void confirmApply({
                          task: taskRef.current,
                          decomposition,
                          checkedSteps: [...checkedSteps],
                          useAsNextAction,
                        }).then(() => {
                          invalidate();
                          close();
                        });
                      }}
                    >
                      Confirm
                    </Button>
                  </div>
                </>
              ) : fallbackText ? (
                <>
                  <p className="text-sm text-text-muted">
                    The reply did not come back in the expected shape, so it is
                    here as plain text. Read it or copy it — nothing is saved as
                    structure from a reply like this.
                  </p>
                  <pre
                    className="whitespace-pre-wrap text-sm text-text bg-surface-2 rounded-xl p-3"
                    data-testid="fallback-text"
                  >
                    {fallbackText}
                  </pre>
                  <div className="flex justify-end">
                    <Button variant="ghost" onClick={close}>
                      Close
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function buildInput(task: Task, projectTitle?: string): DecompositionTaskInput {
  return {
    title: task.title,
    nextAction: task.nextAction ?? undefined,
    estimateMinutes: task.estimateMin ?? undefined,
    project: projectTitle
      ? { title: projectTitle }
      : undefined,
  };
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-text-muted mb-1">{title}</p>
      <ul className="text-sm text-text space-y-1 list-disc pl-4">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Which provider the call would use, resolved without sending anything. */
type ProviderPreview =
  | { state: 'ready'; providerName: string; model: string; local: boolean }
  | { state: 'blocked' | 'unavailable'; message: string };

function usePreviewProvider(active: boolean): ProviderPreview {
  const [preview, setPreview] = useState<ProviderPreview>({
    state: 'unavailable',
    message: 'Checking the provider…',
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      try {
        const settings = await llmSettingsRepo.get();
        const config = await resolveProviderFor(settings, undefined, DECOMPOSITION_FEATURE);
        if (!cancelled) {
          setPreview({
            state: 'ready',
            providerName: config.providerName,
            model: config.model,
            local: isLocalProvider(config),
          });
        }
      } catch (e) {
        if (cancelled) return;
        const message =
          e instanceof LLMException ? e.message : 'No provider is ready for this yet.';
        setPreview({ state: e instanceof LLMException && e.kind === 'privacyBlocked' ? 'blocked' : 'unavailable', message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  return preview;
}

/** Apply what the user picked. Nothing is written before this runs. */
export async function confirmApply(input: {
  task: Task | null;
  decomposition: Decomposition;
  checkedSteps: number[];
  useAsNextAction: boolean;
}): Promise<void> {
  const { task, decomposition, checkedSteps, useAsNextAction } = input;
  if (!task) return;
  if (useAsNextAction) {
    await taskRepo.update(task.id, { nextAction: decomposition.firstAction });
  }
  const steps = decomposition.steps ?? [];
  for (const i of checkedSteps) {
    const step = steps[i];
    if (!step) continue;
    await taskRepo.create({
      title: step.title,
      parentId: task.id,
      projectId: task.projectId ?? null,
      domainId: task.domainId ?? null,
      status: 'inbox',
      source: 'ai',
      estimateMin: step.minutes,
    });
  }
}
