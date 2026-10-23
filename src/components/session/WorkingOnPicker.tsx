'use client';

import React, { useMemo } from 'react';
import { useFlag } from '@/hooks/useFlags';
import { useTasks, useProjects } from '@/hooks/useTasks';
import type { Task } from '@/lib/schemas/task';
import type { Project } from '@/lib/schemas/project';

export interface WorkingOnSelection {
  taskId: string | null;
  projectId: string | null;
  label?: string;
  estimateMin?: number | null;
  /** Calm "pick up here" line from the task's next action or the project's breadcrumb. */
  hint?: string | null;
}

interface Props {
  taskId: string | null;
  projectId: string | null;
  onSelect: (selection: WorkingOnSelection) => void;
}

const ACTIVE_TASK_STATUSES = new Set(['inbox', 'next', 'scheduled']);

/**
 * "Working on" picker for the session form (roadmap W9, behind `taskInbox`).
 *
 * Optional: the default is a plain practice session with no link. Lists active
 * tasks (inbox/next/scheduled, newest touch first) and active projects, and
 * shows a calm "Pick up here" line for the selection so the breadcrumb is
 * visible the next time the work is picked up.
 */
export function WorkingOnPicker({ taskId, projectId, onSelect }: Props) {
  const enabled = useFlag('taskInbox');
  const { data: tasks = [] } = useTasks({ enabled });
  const { data: projects = [] } = useProjects({ enabled });

  const activeTasks = useMemo(
    () => tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status)),
    [tasks],
  );
  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === 'active'),
    [projects],
  );

  if (!enabled) return null;

  const value = taskId ? `task:${taskId}` : projectId ? `project:${projectId}` : '';
  const selectedTask = activeTasks.find((task) => task.id === taskId) ?? null;
  const selectedProject = activeProjects.find((project) => project.id === projectId) ?? null;
  const hint = breadcrumbHint(selectedTask, selectedProject);

  function handleChange(next: string) {
    if (next === '') {
      onSelect({ taskId: null, projectId: null });
      return;
    }
    const [kind, id] = next.split(':');
    if (kind === 'task') {
      const task = activeTasks.find((candidate) => candidate.id === id);
      if (!task) {
        onSelect({ taskId: null, projectId: null });
        return;
      }
      onSelect({
        taskId: task.id,
        projectId: null,
        label: (task.nextAction || task.title).slice(0, 50),
        estimateMin: task.estimateMin ?? null,
        hint: breadcrumbHint(task, null),
      });
      return;
    }
    const project = activeProjects.find((candidate) => candidate.id === id);
    onSelect({
      taskId: null,
      projectId: project?.id ?? null,
      label: project ? project.title.slice(0, 50) : undefined,
      hint: project ? breadcrumbHint(null, project) : null,
    });
  }

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="working-on"
        className="text-xs uppercase tracking-wide text-text-muted block"
      >
        Working on (optional)
      </label>
      <select
        id="working-on"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        className="w-full bg-surface-2 rounded-xl px-4 py-2.5 text-text text-sm border border-border focus:border-accent outline-none min-h-11"
      >
        <option value="">No link — practice session</option>
        {activeTasks.length > 0 ? (
          <optgroup label="Tasks">
            {activeTasks.map((task) => (
              <option key={task.id} value={`task:${task.id}`}>
                {task.title}
              </option>
            ))}
          </optgroup>
        ) : null}
        {activeProjects.length > 0 ? (
          <optgroup label="Projects">
            {activeProjects.map((project) => (
              <option key={project.id} value={`project:${project.id}`}>
                {project.title}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      {hint ? (
        <p className="text-xs text-text-muted">
          Pick up here: <span className="text-text">{hint}</span>
        </p>
      ) : null}
    </div>
  );
}

function breadcrumbHint(task: Task | null, project: Project | null): string | null {
  if (task?.nextAction) return task.nextAction;
  if (project?.breadcrumb) return project.breadcrumb;
  return null;
}
