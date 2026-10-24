'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BREADCRUMB_MAX } from '@/lib/review/limits';
import type { ProjectDecision } from '@/lib/review/decisions';
import type { Project, ProjectInput } from '@/lib/schemas/project';
import type { WeeklyStats } from '@/lib/review/stats';

interface Props {
  projects: Project[];
  weekByProject: Map<string, WeeklyStats['projects'][number]>;
  decisions: Record<string, ProjectDecision>;
  busy: boolean;
  onSave: (projectId: string, patch: Partial<ProjectInput>, decision: ProjectDecision) => Promise<void>;
}

function weeksAgo(days: number): string {
  if (days <= 0) return 'touched today';
  if (days === 1) return 'touched yesterday';
  if (days < 7) return `touched ${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'last touched a week ago' : `last touched ${weeks} weeks ago`;
}

/**
 * Step 3 of the review: confirm where each project stands. Status, the
 * breadcrumb (the "after this, do X" line), and pause anything the user is not
 * going to touch. Writes are immediate and one row each.
 */
export function ProjectsStep({ projects, weekByProject, decisions, busy, onSave }: Props) {
  const [breadcrumb, setBreadcrumb] = useState<Record<string, string>>({});

  if (projects.length === 0) {
    return (
      <Card>
        <p className="font-serif text-lg text-text">No projects to review yet.</p>
        <p className="mt-1 text-sm text-text-muted">
          Projects hold work that takes more than one sitting. When one exists, it shows up here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        Every project gets a quick look: is it still active, and do you know the next step? Pausing is free and does
        not delete anything.
      </p>
      {projects.map((project) => {
        const week = weekByProject.get(project.id);
        const decision = decisions[project.id];
        const status = decision?.status ?? project.status;
        const saved = breadcrumb[project.id] ?? decision?.breadcrumb ?? project.breadcrumb ?? '';
        const sessionsThisWeek = week?.sessionsThisWeek ?? 0;
        const debt = week?.cadenceDebt ?? 0;
        return (
          <Card key={project.id}>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words font-serif text-base text-text">{project.title}</p>
              <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">
                {status === 'paused' ? 'paused' : 'active'}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              {sessionsThisWeek === 0
                ? 'No sessions this week'
                : `${sessionsThisWeek} session${sessionsThisWeek === 1 ? '' : 's'} this week`}
              {week ? ` · ${weeksAgo(week.daysSinceTouched)}` : null}
              {project.cadencePerWeek != null
                ? ` · rhythm ${project.cadencePerWeek} a week${debt > 0 ? `, ${debt} to go` : ', kept'}`
                : ' · no rhythm set'}
            </p>

            <label className="mt-3 block text-xs text-text-muted" htmlFor={`breadcrumb-${project.id}`}>
              After this, the next step for “{project.title}”
            </label>
            <input
              id={`breadcrumb-${project.id}`}
              value={saved}
              maxLength={BREADCRUMB_MAX}
              onChange={(event) => setBreadcrumb((current) => ({ ...current, [project.id]: event.target.value }))}
              className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3 py-3 text-text"
              placeholder="e.g. draft the next chapter outline"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                className="min-h-11"
                aria-label={`Save the next step for “${project.title}”`}
                disabled={busy}
                onClick={() => {
                  const value = saved.trim();
                  void onSave(
                    project.id,
                    { breadcrumb: value === '' ? null : value.slice(0, BREADCRUMB_MAX) },
                    { breadcrumb: value === '' ? null : value.slice(0, BREADCRUMB_MAX) },
                  );
                }}
              >
                Save next step
              </Button>
              {status === 'active' ? (
                <Button
                  variant="ghost"
                  className="min-h-11"
                  aria-label={`Pause “${project.title}”`}
                  disabled={busy}
                  onClick={() => void onSave(project.id, { status: 'paused' }, { status: 'paused' })}
                >
                  Pause for now
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  className="min-h-11"
                  aria-label={`Make “${project.title}” active again`}
                  disabled={busy}
                  onClick={() => void onSave(project.id, { status: 'active' }, { status: 'active' })}
                >
                  Make active again
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
