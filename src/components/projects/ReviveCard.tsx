'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useSessionLauncher } from '@/components/session/SessionLauncher';
import { useFlag } from '@/hooks/useFlags';
import { useTodayKey } from '@/hooks/usePlanning';
import { useSessions } from '@/hooks/useSessions';
import { useProjects, useTasks } from '@/hooks/useTasks';
import {
  latestSessionNote,
  projectNextAction,
  projectSessions,
  projectTimeline,
  workedAgo,
} from '@/lib/planning/project-history';
import {
  dismissRevive,
  minimumSessionLink,
  selectRevive,
  type ReviveState,
} from '@/lib/planning/revive';
import { readReviveState, writeReviveState } from '@/lib/planning/revive-store';
import { detectStalls } from '@/lib/planning/stall';

/**
 * The gentle offer (roadmap Wave 10, part 3): when a project has gone quiet, one
 * small way back in. Never a warning - no red, no "overdue", no count of what was
 * missed - and never more than one card a day (see `revive.ts`).
 *
 * With the `taskInbox` flag off it renders nothing and reads nothing: its queries
 * are gated, and the device-local state is not touched either.
 */
export function ReviveCard() {
  const enabled = useFlag('taskInbox');
  const today = useTodayKey();
  const projectsQuery = useProjects({ enabled });
  const tasksQuery = useTasks({ enabled });
  const { sessions } = useSessions();
  const launcher = useSessionLauncher();

  // Read the device-local state after mount (never during a static render) and
  // only when the feature is on. Until then there is no card, so nothing flashes.
  const [state, setState] = useState<ReviveState | null>(null);
  useEffect(() => {
    if (enabled) setState(readReviveState());
  }, [enabled]);

  const projects = projectsQuery.data;
  const tasks = tasksQuery.data;
  const offer = useMemo(() => {
    if (!enabled || state === null || !projects || !tasks) return null;
    const now = new Date();
    const stall = selectRevive(detectStalls({ projects, sessions, tasks, now }), state, today);
    if (!stall) return null;
    const timeline = projectTimeline(projectSessions(stall.project.id, sessions, tasks));
    const note = projectNextAction(stall.project, tasks, now, { sessionNote: latestSessionNote(timeline) }).breadcrumb;
    return { stall, note };
  }, [enabled, state, projects, tasks, sessions, today]);

  if (!offer) return null;
  const { project, daysQuiet } = offer.stall;

  function putAside() {
    const next = dismissRevive(state ?? { quietDay: null, snoozedUntil: {} }, project.id, today);
    writeReviveState(next); // if the browser refuses, the offer simply may return
    setState(next);
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-xs uppercase tracking-wide text-text-muted">Whenever you&apos;re ready</h2>
      <div className="space-y-1">
        <p className="font-serif text-base text-text break-words">{project.title}</p>
        <p className="text-sm text-text-muted">
          {workedAgo(daysQuiet)}. Ten minutes is enough to keep it going.
        </p>
        {offer.note ? <p className="text-sm text-text break-words">Pick up here: {offer.note}</p> : null}
      </div>
      {/* Full-width and left-aligned: right-aligned controls sit behind the practice button. */}
      <div className="flex flex-col gap-2">
        <Button
          className="min-h-11 w-full"
          aria-label={`Start 10 minutes on ${project.title}`}
          onClick={() => launcher.openForLink(minimumSessionLink(project))}
        >
          Start 10 minutes
        </Button>
        <Button variant="ghost" className="min-h-11 w-full border border-border" onClick={putAside}>
          Not now
        </Button>
        <Link
          href={`/projects/detail?id=${project.id}`}
          className="inline-flex items-center min-h-11 text-xs text-accent"
        >
          Open project
        </Link>
      </div>
    </Card>
  );
}
