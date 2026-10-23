import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { resetDbForTesting } from '@/lib/db/db';
import { taskRepo } from '@/lib/db/task.repo';
import { projectRepo } from '@/lib/db/project.repo';
import { useInbox } from '@/hooks/useTasks';
import { toLocalDateString } from '@/lib/utils/date';

beforeEach(async () => {
  await resetDbForTesting();
});

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

async function seedTask(title: string) {
  return taskRepo.create({ title, status: 'inbox', source: 'manual' });
}

describe('useInbox', () => {
  it('lists only inbox tasks, newest first', async () => {
    const older = await seedTask('older');
    const newer = await seedTask('newer');
    const done = await taskRepo.create({ title: 'done one', status: 'inbox', source: 'manual' });
    await taskRepo.setStatus(done.id, 'done');

    const { result } = renderHook(() => useInbox(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.count).toBe(2));
    expect(result.current.inbox.map((t) => t.id)).toEqual([newer.id, older.id]);
  });

  it('do-now removes the task from the inbox and marks it done', async () => {
    const task = await seedTask('two minute thing');
    const { result } = renderHook(() => useInbox(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.count).toBe(1));

    await act(async () => {
      await result.current.triage({ task, outcome: 'do-now' });
    });

    await waitFor(() => expect(result.current.count).toBe(0));
    const stored = await taskRepo.getById(task.id);
    expect(stored?.status).toBe('done');
    expect(stored?.doneAt).toBeInstanceOf(Date);
  });

  it('schedules to the chosen local day and clears it on the next outcome', async () => {
    const task = await seedTask('renew domain');
    const day = new Date(2026, 9, 24, 12);
    const { result } = renderHook(() => useInbox(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.count).toBe(1));

    await act(async () => {
      await result.current.triage({ task, outcome: 'schedule', input: { deferUntil: day } });
    });
    await waitFor(async () => {
      const stored = await taskRepo.getById(task.id);
      expect(stored?.status).toBe('scheduled');
      expect(stored?.deferUntil && toLocalDateString(stored.deferUntil)).toBe('2026-10-24');
    });
  });

  it('stores the next action and moves to next', async () => {
    const task = await seedTask('fix hose');
    const { result } = renderHook(() => useInbox(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.count).toBe(1));

    await act(async () => {
      await result.current.triage({ task, outcome: 'next-action', input: { nextAction: 'find the spanner' } });
    });

    await waitFor(async () => {
      const stored = await taskRepo.getById(task.id);
      expect(stored?.status).toBe('next');
      expect(stored?.nextAction).toBe('find the spanner');
    });
  });

  it('drops without guilt and can undo back to the inbox', async () => {
    const task = await seedTask('learn to juggle');
    const { result } = renderHook(() => useInbox(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.count).toBe(1));

    await act(async () => {
      await result.current.triage({ task, outcome: 'drop' });
    });
    await waitFor(async () => expect((await taskRepo.getById(task.id))?.status).toBe('dropped'));

    await act(async () => {
      await result.current.undo(task.id);
    });
    await waitFor(async () => expect((await taskRepo.getById(task.id))?.status).toBe('inbox'));
  });

  it('makes a project from a task and links it', async () => {
    const task = await seedTask('kitchen renovation');
    const { result } = renderHook(() => useInbox(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.count).toBe(1));

    await act(async () => {
      await result.current.triage({ task, outcome: 'make-project' });
    });

    await waitFor(async () => {
      const stored = await taskRepo.getById(task.id);
      expect(stored?.status).toBe('next');
      expect(stored?.projectId).toBeTruthy();
      const project = await projectRepo.getById(stored!.projectId!);
      expect(project?.title).toBe('kitchen renovation');
      expect(project?.status).toBe('active');
    });
  });

  it('refuses an illegal triage input without changing the task', async () => {
    const task = await seedTask('needs a next action');
    const { result } = renderHook(() => useInbox(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.count).toBe(1));

    await act(async () => {
      await expect(result.current.triage({ task, outcome: 'next-action' })).rejects.toThrow(
        /next small step/,
      );
    });
    expect((await taskRepo.getById(task.id))?.status).toBe('inbox');
  });
});
