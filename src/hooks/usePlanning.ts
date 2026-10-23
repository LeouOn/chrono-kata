'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/hooks/useSettings';
import { useFlag } from '@/hooks/useFlags';
import { useTasks, useProjects } from '@/hooks/useTasks';
import { useSessions } from '@/hooks/useSessions';
import { useDomains } from '@/hooks/useDomains';
import { blockRepo } from '@/lib/db/block.repo';
import { dayPlanRepo } from '@/lib/db/day-plan.repo';
import { resolveAnchors, resolveWakingHours } from '@/lib/planning/resolve';
import { anchorsWithinWindow } from '@/lib/planning/anchors';
import { computeCapacity, type CapacityResult } from '@/lib/planning/capacity';
import { rankPicks, type RankedPick } from '@/lib/planning/rank-picks';
import { wakingWindow } from '@/lib/planning/time';
import { addDays } from '@/lib/pacing/days';
import { toLocalDateString } from '@/lib/utils/date';
import type { Anchor, WakingHours } from '@/lib/schemas/settings';
import type { DayPlan, DayPlanInput } from '@/lib/schemas/day-plan';

export interface DayPlanView {
  capacity: CapacityResult;
  picks: RankedPick[];
  dayPlan: DayPlan | null;
  wakingHours: WakingHours;
  anchors: Anchor[];
  dayKey: string;
  enabled: boolean;
  /** False while the task or plan query is still resolving (used to defer drafts). */
  isLoading: boolean;
}

const DAYS_IN_CADENCE_WINDOW = 7;

/**
 * Everything the plan screen and the Today card need, computed once.
 *
 * With the `taskInbox` flag off this performs no task/plan work at all: every
 * query it adds is `enabled` only when the flag is on. (Sessions come from the
 * existing practice query the home page already runs.)
 */
export function usePlanToday(dayKey?: string): DayPlanView {
  const enabled = useFlag('taskInbox');
  const today = dayKey ?? toLocalDateString(new Date());
  const { settings, isLoading: settingsLoading } = useSettings();
  // Memoise on the settings object: resolve* build new objects, but
  // react-query keeps `settings` stable while the data is unchanged, so these
  // identities hold until an input really changes (no per-render churn).
  const wakingHours = useMemo(() => resolveWakingHours(settings), [settings]);
  const anchors = useMemo(() => resolveAnchors(settings), [settings]);

  const tasksQuery = useTasks({ enabled });
  const projectsQuery = useProjects({ enabled });
  const { sessions } = useSessions();
  const domainsQuery = useDomains({ enabled });

  const window = useMemo(() => wakingWindow(today, wakingHours), [today, wakingHours]);

  const blocksQuery = useQuery({
    queryKey: ['blocks', 'fixed', today, window.start, window.end],
    queryFn: async () => {
      const blocks = await blockRepo.range(new Date(window.start), new Date(window.end));
      return blocks.filter((block) => block.kind === 'fixed');
    },
    enabled,
  });

  const dayPlanQuery = useQuery({
    queryKey: ['dayPlan', today],
    queryFn: () => dayPlanRepo.getByDate(today),
    enabled,
  });

  const capacity = useMemo(
    () =>
      computeCapacity({
        day: today,
        wakingHours,
        fixedBlocks: (blocksQuery.data ?? []).map((block) => ({
          start: block.start,
          end: block.end,
        })),
        anchors,
        bufferPct: 25,
      }),
    [today, wakingHours, anchors, blocksQuery.data],
  );

  const picks = useMemo(() => {
    if (!enabled) return [];
    const cadenceDays = new Set<string>();
    for (let offset = 0; offset < DAYS_IN_CADENCE_WINDOW; offset += 1) {
      cadenceDays.add(addDays(today, -offset));
    }
    const recentSessions = sessions.filter((session) =>
      cadenceDays.has(toLocalDateString(session.startedAt)),
    );

    const tasks = tasksQuery.data ?? [];
    const taskById = new Map(tasks.map((task) => [task.id, task] as const));
    const projectById = new Map((projectsQuery.data ?? []).map((project) => [project.id, project] as const));
    const todaySessions = sessions.filter((session) => toLocalDateString(session.startedAt) === today);
    const domainTime: Record<string, number> = {};
    for (const session of todaySessions) {
      const domainId =
        (session.taskId ? taskById.get(session.taskId)?.domainId : null) ??
        (session.projectId ? projectById.get(session.projectId)?.domainId : null);
      if (!domainId) continue;
      domainTime[domainId] = (domainTime[domainId] ?? 0) + (session.durationMinutes ?? 0);
    }

    return rankPicks({
      tasks,
      projects: projectsQuery.data ?? [],
      recentSessions,
      domainTime,
      capacity,
      now: new Date(),
      // Clip to the waking window, exactly like capacity, so an anchor outside
      // it can never add availability to the ranking.
      anchors: anchorsWithinWindow(anchors, today, window),
      domains: domainsQuery.data ?? [],
    });
  }, [enabled, today, sessions, tasksQuery.data, projectsQuery.data, domainsQuery.data, capacity, anchors, window]);

  return {
    capacity,
    picks,
    dayPlan: dayPlanQuery.data ?? null,
    wakingHours,
    anchors,
    dayKey: today,
    enabled,
    // While the flag itself is still resolving, planning data is not ready
    // either: initialising a draft then would freeze an empty suggestion list.
    isLoading: settingsLoading || (enabled && (tasksQuery.isLoading || dayPlanQuery.isLoading)),
  };
}

/**
 * The local day key, refreshed when the day rolls over while the app is open
 * (visibility/focus, plus a minute tick like the layout's streak refresh).
 */
export function useTodayKey(): string {
  const [dayKey, setDayKey] = useState(() => toLocalDateString(new Date()));

  useEffect(() => {
    const check = () => {
      const next = toLocalDateString(new Date());
      setDayKey((current) => (current === next ? current : next));
    };
    const interval = window.setInterval(check, 60_000);
    const onWake = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, []);

  return dayKey;
}

/** Persist the confirmed plan for a day and refresh the plan-dependent views. */
export function useConfirmDayPlan(dayKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DayPlanInput) => dayPlanRepo.upsert(dayKey, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dayPlan', dayKey] });
      // A confirmed plan changes the Today card, not task data; tasks/projects
      // stay untouched.
    },
  });
}
