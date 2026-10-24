'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useProjects, useTasks } from '@/hooks/useTasks';
import { useSessions } from '@/hooks/useSessions';
import { useDomains } from '@/hooks/useDomains';
import { cadenceProgress, projectOfTaskIndex } from '@/lib/planning/cadence';
import { lastWorkByProject } from '@/lib/planning/stall';
import { daysUntouched } from '@/lib/planning/untouched';
import {
  latestSessionNote,
  outcomeLabel,
  projectNextAction,
  projectSessions,
  projectStatusLabel,
  projectTimeline,
  rhythmLines,
  timeInvested,
  workedAgo,
  type TimelineEntry,
} from '@/lib/planning/project-history';
import { formatDuration } from '@/lib/utils/format';

/** How many timeline entries show at first, and how many each "earlier" press adds. */
export const TIMELINE_PAGE = 20;

function formatDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function amount(entry: TimelineEntry): string | null {
  if (entry.minutes != null) return formatDuration(Math.round(entry.minutes));
  if (entry.reps != null) return `${entry.reps} reps`;
  return null;
}

/**
 * One project (roadmap Wave 10, part 2): what is next, the rhythm, the time put
 * in, and the history of "pick up here" notes. Read-only: the page changes
 * nothing, so there is nothing to lose by opening it.
 */
export function ProjectDetail({ projectId }: { projectId: string | null }) {
  const projectsQuery = useProjects();
  const tasksQuery = useTasks();
  const domainsQuery = useDomains();
  const { sessions } = useSessions();
  const [shown, setShown] = useState(TIMELINE_PAGE);

  const loading = projectsQuery.isLoading || tasksQuery.isLoading;
  const project = projectsQuery.data?.find((candidate) => candidate.id === projectId) ?? null;
  const tasks = tasksQuery.data;

  const view = useMemo(() => {
    if (!project || !tasks) return null;
    const now = new Date();
    const mine = projectSessions(project.id, sessions, tasks);
    const lastWork = lastWorkByProject([project], sessions, tasks).get(project.id) ?? project.lastTouchedAt;
    const timeline = projectTimeline(mine);
    return {
      timeline,
      sessionCount: mine.length,
      invested: timeInvested(mine, now),
      next: projectNextAction(project, tasks, now, { sessionNote: latestSessionNote(timeline) }),
      rhythm: rhythmLines(project, cadenceProgress(project, sessions, now, projectOfTaskIndex(tasks))),
      daysQuiet: daysUntouched(lastWork, now),
    };
  }, [project, tasks, sessions]);

  const back = (
    <Link href="/projects" className="inline-flex items-center gap-1 min-h-11 text-sm text-accent">
      <ChevronLeft size={16} aria-hidden />
      All projects
    </Link>
  );

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>;

  if (!project || !view) {
    return (
      <div className="space-y-3">
        {back}
        <Card>
          <p className="font-serif text-lg text-text">This project isn&apos;t here.</p>
          <p className="text-sm text-text-muted mt-1">It may have been removed from this device.</p>
        </Card>
      </div>
    );
  }

  const domain = domainsQuery.data?.find((candidate) => candidate.id === project.domainId);
  const { invested, next, rhythm, timeline } = view;
  let remaining = shown;
  const visibleDays = timeline
    .map((day) => {
      const entries = day.entries.slice(0, Math.max(0, remaining));
      remaining -= entries.length;
      return { ...day, entries };
    })
    .filter((day) => day.entries.length > 0);

  return (
    <div className="space-y-4">
      {back}

      <div>
        <h1 className="font-serif text-2xl text-text break-words">{project.title}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {projectStatusLabel(project.status)}
          {domain ? ` · ${domain.name}` : ''} · {workedAgo(view.daysQuiet)}
        </p>
      </div>

      <Card className="space-y-3">
        <h2 className="text-xs uppercase tracking-wide text-text-muted">What is next</h2>
        {next.breadcrumb ? (
          <div>
            <p className="text-xs text-text-muted">Pick up here</p>
            <p className="text-sm text-text break-words">{next.breadcrumb}</p>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            No note yet. The next session will leave one.
          </p>
        )}
        {next.nextTasks.length > 0 ? (
          <ul className="space-y-2" aria-label="Next tasks">
            {next.nextTasks.map((task) => (
              <li key={task.id} className="text-sm text-text break-words">
                {task.title}
                {task.nextAction ? (
                  <span className="block text-xs text-text-muted">{task.nextAction}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">No next tasks.</p>
        )}
      </Card>

      <Card className="space-y-1">
        <h2 className="text-xs uppercase tracking-wide text-text-muted">Rhythm and time</h2>
        <p className="text-sm text-text">{rhythm.target ? `Rhythm: ${rhythm.target}` : 'No rhythm set.'}</p>
        {rhythm.week ? <p className="text-sm text-text-muted">{rhythm.week}</p> : null}
        <p className="text-sm text-text">
          {invested.sessions === 0
            ? 'No sessions yet.'
            : `${formatDuration(Math.round(invested.minutes))} across ${invested.sessions} session${invested.sessions === 1 ? '' : 's'}`}
        </p>
        {invested.sessions > 0 ? (
          <p className="text-sm text-text-muted">
            Last 7 days: {formatDuration(Math.round(invested.thisWeekMinutes))} in {invested.thisWeekSessions} session
            {invested.thisWeekSessions === 1 ? '' : 's'}
          </p>
        ) : null}
      </Card>

      <section className="space-y-3" aria-label="History">
        <h2 className="text-xs uppercase tracking-wide text-text-muted">History</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nothing here yet. Each session you spend on this project adds a line.
          </p>
        ) : null}
        {visibleDays.map((day) => (
          <div key={day.dayKey} className="space-y-2">
            <h3 className="text-sm font-medium text-text">
              <time dateTime={day.dayKey}>{formatDay(day.dayKey)}</time>
            </h3>
            <ul className="space-y-2">
              {day.entries.map((entry) => {
                const parts = [formatClock(entry.at), amount(entry), outcomeLabel(entry.outcome)].filter(Boolean);
                return (
                  <li key={entry.sessionId} className="rounded-2xl border border-border bg-surface px-3 py-2">
                    <p className="text-xs text-text-muted">{parts.join(' · ')}</p>
                    {entry.breadcrumb ? (
                      <p className="text-sm text-text break-words">Pick up here: {entry.breadcrumb}</p>
                    ) : null}
                    <Link
                      href={`/sessions/detail?id=${entry.sessionId}`}
                      className="mt-1 inline-flex items-center min-h-11 text-xs text-accent"
                      aria-label={`Open session from ${formatDay(day.dayKey)} at ${formatClock(entry.at)}`}
                    >
                      Open
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {view.sessionCount > shown ? (
          <Button variant="ghost" className="min-h-11 w-full" onClick={() => setShown((count) => count + TIMELINE_PAGE)}>
            Show earlier sessions
          </Button>
        ) : null}
      </section>
    </div>
  );
}
