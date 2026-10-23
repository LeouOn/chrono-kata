'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { taskRepo } from '@/lib/db/task.repo';
import { projectRepo } from '@/lib/db/project.repo';
import {
  outcomeTransition,
  UNDO_STATUS,
  type InboxOutcome,
  type OutcomeInput,
} from '@/lib/tasks/outcomes';
import type { Task, TaskInput, TaskStatus } from '@/lib/schemas/task';
import type { Project } from '@/lib/schemas/project';

const TASKS_KEY = ['tasks'] as const;
const PROJECTS_KEY = ['projects'] as const;

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: TASKS_KEY });
  void qc.invalidateQueries({ queryKey: PROJECTS_KEY });
}

/** All tasks, newest touch first (repository order). */
export function useTasks() {
  return useQuery({
    queryKey: TASKS_KEY,
    queryFn: () => taskRepo.getAll(),
  });
}

/**
 * Inbox triage state: the inbox itself plus the mutations process mode needs.
 * Status changes go through `setStatus` so `doneAt` and the transition rules
 * stay in the repository, and field changes (nextAction/deferUntil) go through
 * `update` first.
 */
export function useInbox() {
  const qc = useQueryClient();
  const query = useTasks();

  const inbox = (query.data ?? [])
    .filter((task) => task.status === 'inbox')
    .sort((a, b) => b.touchedAt.getTime() - a.touchedAt.getTime());

  const createMutation = useMutation({
    mutationFn: (input: TaskInput) => taskRepo.create(input),
    onSuccess: () => invalidateAll(qc),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TaskInput> }) => taskRepo.update(id, patch),
    onSuccess: () => invalidateAll(qc),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => taskRepo.setStatus(id, status),
    onSuccess: () => invalidateAll(qc),
  });

  const projectMutation = useMutation({
    mutationFn: async ({
      task,
      title,
    }: {
      task: Task;
      title: string;
    }): Promise<Project> => {
      const project = await projectRepo.create({
        title: title.trim() === '' ? task.title.slice(0, 200) : title.trim().slice(0, 200),
        status: 'active',
        domainId: task.domainId ?? null,
      });
      await taskRepo.update(task.id, { projectId: project.id });
      await taskRepo.setStatus(task.id, 'next');
      return project;
    },
    onSuccess: () => invalidateAll(qc),
  });

  /** Apply a triage outcome. Returns the resulting status, or an error string. */
  const triage = useMutation({
    mutationFn: async ({
      task,
      outcome,
      input,
    }: {
      task: Task;
      outcome: InboxOutcome;
      input?: OutcomeInput;
    }): Promise<{ status: TaskStatus; project?: Project }> => {
      if (outcome === 'make-project') {
        const project = await projectMutation.mutateAsync({ task, title: task.title });
        return { status: 'next', project };
      }
      const result = outcomeTransition(outcome, input);
      if (!result.ok) throw new Error(result.error);

      const { nextAction, deferUntil } = result.transition.patch;
      if (nextAction !== undefined || deferUntil !== undefined) {
        await taskRepo.update(task.id, {
          ...(nextAction !== undefined ? { nextAction } : {}),
          ...(deferUntil !== undefined ? { deferUntil } : {}),
        });
      }
      const updated = await taskRepo.setStatus(task.id, result.transition.status);
      return { status: updated.status };
    },
    onSuccess: () => invalidateAll(qc),
  });

  /** Undo a triage decision: everything returns to the inbox. */
  const undo = useMutation({
    mutationFn: (id: string) => taskRepo.setStatus(id, UNDO_STATUS),
    onSuccess: () => invalidateAll(qc),
  });

  return {
    tasks: query.data ?? [],
    inbox,
    count: inbox.length,
    isLoading: query.isLoading,
    createTask: createMutation.mutateAsync,
    updateTask: updateMutation.mutateAsync,
    setStatus: statusMutation.mutateAsync,
    triage: triage.mutateAsync,
    undo: undo.mutateAsync,
  };
}
