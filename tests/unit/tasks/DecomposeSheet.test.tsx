import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, act, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetDbForTesting } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import type { Task } from '@/lib/schemas/task';

const runDecomposition = vi.hoisted(() => vi.fn());
const calmErrorCopy = vi.hoisted(() => vi.fn(() => 'calm copy'));

vi.mock('@/lib/decomposition/service', () => ({
  runDecomposition: runDecomposition,
  calmErrorCopy: calmErrorCopy,
}));

import { DecomposeSheet } from '@/components/tasks/DecomposeSheet';

const VALID_RESULT = {
  result: {
    kind: 'ok' as const,
    usedFallback: false as const,
    usedRepair: false,
    value: {
      firstAction: 'Find the washer in the garage drawer',
      firstActionMinutes: 5,
      needs: ['a wrench'],
      steps: [
        { title: 'Turn off the water', minutes: 2 },
        { title: 'Replace the washer', minutes: 10 },
        { title: 'Check for leaks', minutes: 5 },
      ],
      pitfalls: ['Starting with the water on'],
      canSkipOrDoBadly: ['Polishing the tap'],
    },
  },
  providerName: 'lmstudio',
  model: 'qwen2.5-7b',
  local: true,
  wire: { system: 'system prompt', user: 'user text' },
};

const FALLBACK_RESULT = {
  result: {
    kind: 'fallback' as const,
    usedFallback: true as const,
    usedRepair: true,
    value: 'Start with one small step. Nothing here is structured.',
    validationError: 'reply invalid',
  },
  providerName: 'lmstudio',
  model: 'qwen2.5-7b',
  local: true,
  wire: { system: 's', user: 'u' },
};

let task: Task;

beforeEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await resetDbForTesting();
  await llmSettingsRepo.addProvider('lmstudio', {
    baseUrl: 'http://localhost:1234/v1',
    apiKey: '',
    model: 'qwen2.5-7b',
    credentialSource: 'browser',
  } as never);
  await llmSettingsRepo.setActive('lmstudio');
  task = await taskRepo.create({ title: 'Fix the dripping hose' });
});

function ui() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DecomposeSheet task={task} projectTitle="Garden revival" />
    </QueryClientProvider>
  );
}

describe('DecomposeSheet', () => {
  it('renders both triggers with accessible names', () => {
    ui();
    expect(screen.getByRole('button', { name: /Break down Fix the dripping hose/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Fix the dripping hose feels heavy/i })).toBeTruthy();
  });

  it('shows exactly what leaves the device before the first call', async () => {
    ui();
    fireEvent.click(screen.getByRole('button', { name: /Break down/i }));
    const wire = screen.getByTestId('wire-user');
    expect(wire.textContent).toContain('- title: Fix the dripping hose');
    expect(wire.textContent).toContain('- project: Garden revival');
    expect(wire.textContent).not.toContain('secret');
    // Exact wire text = the builder output, nothing more.
    expect(wire.textContent).toBe(
      [
        'Task to decompose:',
        '- title: Fix the dripping hose',
        '- project: Garden revival',
        '',
        'Decompose this task. JSON only.',
      ].join('\n'),
    );
    await waitFor(() =>
      expect(screen.getByTestId('wire-provider').textContent).toContain('lmstudio')
    );
    expect(screen.getByTestId('wire-provider').textContent).toContain('on this device');
  });

  it('sends once even for a double click in one act, then renders the result', async () => {
    runDecomposition.mockResolvedValue(VALID_RESULT);
    ui();
    fireEvent.click(screen.getByRole('button', { name: /Break down/i }));
    await waitFor(() => screen.getByRole('button', { name: /Send to lmstudio/i }));
    await act(async () => {
      screen.getByRole('button', { name: /Send to lmstudio/i }).click();
      screen.getByRole('button', { name: /Send to lmstudio/i }).click();
    });
    await waitFor(() => expect(screen.getByTestId('first-action')).toBeTruthy());
    expect(runDecomposition).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('first-action').textContent).toBe(
      'Find the washer in the garage drawer'
    );
  });

  it('writes nothing before Confirm; Confirm applies nextAction and picked steps exactly once', async () => {
    runDecomposition.mockResolvedValue(VALID_RESULT);
    const updateSpy = vi.spyOn(taskRepo, 'update');
    const createSpy = vi.spyOn(taskRepo, 'create');
    ui();
    fireEvent.click(screen.getByRole('button', { name: /Break down/i }));
    await waitFor(() => screen.getByRole('button', { name: /Send to lmstudio/i }));
    fireEvent.click(screen.getByRole('button', { name: /Send to lmstudio/i }));
    await waitFor(() => expect(screen.getByTestId('first-action')).toBeTruthy());
    expect(updateSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();

    // Steps are collapsed by default (jsdom keeps closed <details> queryable,
    // so assert on the open attribute, not visibility).
    const stepsDetails = screen.getByText(/Steps \(3\)/).closest('details')!;
    expect(stepsDetails.hasAttribute('open')).toBe(false);
    fireEvent.click(screen.getByText(/Steps \(3\)/));
    await waitFor(() => expect(stepsDetails.hasAttribute('open')).toBe(true));
    // Pick two of three steps.
    fireEvent.click(screen.getByRole('checkbox', { name: /Turn off the water/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Check for leaks/i }));
    // Double Confirm in one act — one set of writes.
    await act(async () => {
      screen.getByRole('button', { name: /Confirm and save/i }).click();
      screen.getByRole('button', { name: /Confirm and save/i }).click();
    });
    // confirmApply applies sequentially (nextAction, then subtasks); wait
    // for the full set so the count assertion never races the last create.
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(2));
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(task.id, {
      nextAction: 'Find the washer in the garage drawer',
    });
    expect(createSpy).toHaveBeenCalledTimes(2);
    const createdArgs = createSpy.mock.calls.map((c) => c[0]);
    expect(createdArgs).toEqual([
      expect.objectContaining({ title: 'Turn off the water', parentId: task.id, source: 'ai', estimateMin: 2 }),
      expect.objectContaining({ title: 'Check for leaks', parentId: task.id, source: 'ai', estimateMin: 5 }),
    ]);
    // And the subtasks really are in the inbox, linked.
    const subtasks = await taskRepo.children(task.id);
    expect(subtasks.map((t) => t.title).sort()).toEqual(['Check for leaks', 'Turn off the water']);
  });

  it('Save nothing writes nothing', async () => {
    runDecomposition.mockResolvedValue(VALID_RESULT);
    const createSpy = vi.spyOn(taskRepo, 'create');
    ui();
    fireEvent.click(screen.getByRole('button', { name: /Break down/i }));
    await waitFor(() => screen.getByRole('button', { name: /Send to lmstudio/i }));
    fireEvent.click(screen.getByRole('button', { name: /Send to lmstudio/i }));
    await waitFor(() => expect(screen.getByTestId('first-action')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Save nothing' }));
    expect(createSpy).not.toHaveBeenCalled();
    expect(await taskRepo.children(task.id)).toHaveLength(0);
  });

  it('fallback text is shown as plain text with no Confirm', async () => {
    runDecomposition.mockResolvedValue(FALLBACK_RESULT);
    ui();
    fireEvent.click(screen.getByRole('button', { name: /Break down/i }));
    await waitFor(() => screen.getByRole('button', { name: /Send to lmstudio/i }));
    fireEvent.click(screen.getByRole('button', { name: /Send to lmstudio/i }));
    await waitFor(() => expect(screen.getByTestId('fallback-text')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Confirm/i })).toBeNull();
    expect(screen.getByTestId('fallback-text').textContent).toContain('one small step');
  });

  it('shows calm error copy with retry and nothing is written', async () => {
    runDecomposition.mockRejectedValueOnce(Object.assign(new Error('nope'), { kind: 'rateLimited' }));
    const createSpy = vi.spyOn(taskRepo, 'create');
    ui();
    fireEvent.click(screen.getByRole('button', { name: /Break down/i }));
    await waitFor(() => screen.getByRole('button', { name: /Send to lmstudio/i }));
    fireEvent.click(screen.getByRole('button', { name: /Send to lmstudio/i }));
    await waitFor(() => expect(screen.getByTestId('decompose-error')).toBeTruthy());
    expect(screen.getByTestId('decompose-error').textContent).toBe('calm copy');
    expect(createSpy).not.toHaveBeenCalled();
    // Retry recovers.
    runDecomposition.mockResolvedValue(VALID_RESULT);
    fireEvent.click(screen.getByRole('button', { name: /Send to lmstudio/i }));
    await waitFor(() => expect(screen.getByTestId('first-action')).toBeTruthy());
  });

  it('aborting on unmount stops the call and sets no state', async () => {
    let capturedSignal: AbortSignal | null = null;
    runDecomposition.mockImplementation(
      (_mode: unknown, _input: unknown, { signal }: { signal?: AbortSignal }) => {
        capturedSignal = signal ?? null;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      }
    );
    const { unmount } = ui();
    fireEvent.click(screen.getByRole('button', { name: /Break down/i }));
    await waitFor(() => screen.getByRole('button', { name: /Send to lmstudio/i }));
    fireEvent.click(screen.getByRole('button', { name: /Send to lmstudio/i }));
    await waitFor(() => expect(screen.getByTestId('decompose-running')).toBeTruthy());
    unmount();
    // The in-flight call was aborted through the captured signal.
    await waitFor(() => expect(capturedSignal?.aborted).toBe(true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    // If the hook set state after unmount, React logs an error and this test fails.
  });
});
