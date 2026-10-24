'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { useProjects, useTasks } from '@/hooks/useTasks';
import { useSessions } from '@/hooks/useSessions';
import {
  projectStatusLabel,
  projectSummaries,
  rhythmLines,
  workedAgo,
} from '@/lib/planning/project-history';

/**
 * The project list (roadmap Wave 10, part 2): every active or paused project,
 * the one worked on most recently first. Calm by construction - a quiet project
 * was "last worked on" a while ago, nothing more.
 */
export function ProjectsScreen() {
  const projectsQuery = useProjects();
  const tasksQuery = useTasks();
  const { sessions } = useSessions();

  const loading = projectsQuery.isLoading || tasksQuery.isLoading;
  const projects = projectsQuery.data;
  const tasks = tasksQuery.data;
  const rows = useMemo(
    () =>
      projects && tasks
        ? projectSummaries({ projects, sessions, tasks, now: new Date() })
        : [],
    [projects, tasks, sessions],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl text-text mb-1">Projects</h1>
        <p className="text-text-muted text-sm">
          Long efforts, kept alive with small regular sessions.
        </p>
      </div>

      {loading ? <p className="text-sm text-text-muted">Loading…</p> : null}

      {!loading && rows.length === 0 ? (
        <Card>
          <p className="font-serif text-lg text-text">No projects yet.</p>
          <p className="text-sm text-text-muted mt-1">
            A project appears here when you make one while sorting your inbox.
          </p>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <ul className="space-y-3" aria-label="Projects">
          {rows.map(({ project, daysQuiet, progress, nextCount }) => {
            const { target, week } = rhythmLines(project, progress);
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/detail?id=${project.id}`}
                  className="block min-h-11 rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2 transition-colors"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 break-words font-serif text-base text-text">{project.title}</span>{' '}
                    {project.status !== 'active' ? (
                      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">
                        {projectStatusLabel(project.status)}
                      </span>
                    ) : null}
                  </span>{' '}
                  <span className="mt-1 block text-xs text-text-muted">
                    {workedAgo(daysQuiet)}
                    {target ? ` · ${target}` : ' · no rhythm set'}
                  </span>{' '}
                  {week ? (
                    <>
                      <span className="mt-0.5 block text-xs text-text-muted">{week}</span>{' '}
                    </>
                  ) : null}
                  <span className="mt-0.5 block text-xs text-text-muted">
                    {nextCount === 0
                      ? 'No next tasks'
                      : `${nextCount} next task${nextCount === 1 ? '' : 's'}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
