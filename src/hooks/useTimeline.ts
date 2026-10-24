'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blockRepo } from '@/lib/db/block.repo';
import { useFlag } from '@/hooks/useFlags';
import { usePlanToday } from '@/hooks/usePlanning';
import { useTasks } from '@/hooks/useTasks';
import { resolveAnchors, resolveWakingHours } from '@/lib/planning/resolve';
import { anchorsWithinWindow } from '@/lib/planning/anchors';
import type { AnchorInterval as DatedAnchor } from '@/lib/planning/anchors';
import { localDayStart, wakingWindow, localWallClockToEpoch } from '@/lib/planning/time';
import { toLocalDateString } from '@/lib/utils/date';
import { addDays } from '@/lib/pacing/days';
import { proposeLayout, replanFromNow, type Interval, type ProposedBlock } from '@/lib/planning/layout';
import { useNow } from '@/hooks/useNow';
import { commitLayout } from '@/lib/planning/commit';
import { layoutPickIds } from '@/lib/planning/layout-picks';
import type { Block, BlockInput } from '@/lib/schemas/block';
import type { Settings, WakingHours } from '@/lib/schemas/settings';

export const TIMELINE_STEP_MIN = 15;

export interface TimelineView {
  enabled: boolean;
  dayKey: string;
  window: { start: number; end: number };
  wakingHours: WakingHours;
  blocks: Block[];
  fixedBlocks: Block[];
  focusBlocks: Block[];
  anchors: DatedAnchor[];
  hasPlan: boolean;
  focusInWindow: Block[];
  proposal: {
    blocks: ProposedBlock[];
    unplaced: { id: string; estimateMin?: number | null }[];
    /** Replan re-lays only picks whose block had not started. */
    replanned: boolean;
    /** Task ids that did not fit and go back to the list. */
    overflow: string[];
    keptCount: number;
  } | null;
  pickIds: string[];
}

/** Blocks that overlap a day's waking window (any kind). Flag-gated. */
export function useDayBlocks(dayKey: string) {
  const enabled = useFlag('taskInbox');
  // Fetch a little beyond the waking window so a commitment outside it is
  // still visible (it is listed under the timeline, never silently hidden).
  const from = localDayStart(dayKey);
  const to = localWallClockToEpoch(addDays(dayKey, 2), '00:00');
  return useQuery({
    queryKey: ['timelineBlocks', dayKey, from, to],
    queryFn: async () => blockRepo.range(new Date(from), new Date(to)),
    enabled,
  });
}

/** Blocks whose local start day is this timeline's day but which sit outside its window. */
export function outsideWindowBlocks(blocks: readonly Block[], dayKey: string, window: { start: number; end: number }): Block[] {
  return blocks.filter(
    (block) =>
      (block.end.getTime() <= window.start || block.start.getTime() >= window.end) &&
      toLocalDateString(block.start) === dayKey,
  );
}

/** Everything the timeline renders for one day. */
export function useTimeline(dayKey: string, settings: Settings | null | undefined, stepMin = TIMELINE_STEP_MIN): TimelineView {
  const enabled = useFlag('taskInbox');
  const wakingHours = useMemo(() => resolveWakingHours(settings), [settings]);
  const anchorDefs = useMemo(() => resolveAnchors(settings), [settings]);
  const window = useMemo(() => wakingWindow(dayKey, wakingHours), [dayKey, wakingHours]);
  const anchors = useMemo(() => anchorsWithinWindow(anchorDefs, dayKey, window), [anchorDefs, dayKey, window]);
  const blocksQuery = useDayBlocks(dayKey);
  const plan = usePlanToday(dayKey);
  const tasksQuery = useTasks({ enabled });
  const now = useNow();

  const blocks = blocksQuery.data ?? [];
  const fixedBlocks = blocks.filter((block) => block.kind === 'fixed');
  const focusBlocks = blocks.filter((block) => block.kind === 'focus');
  const focusInWindow = focusBlocks.filter(
    (block) => block.start.getTime() < window.end && block.end.getTime() > window.start,
  );

  const taskById = useMemo(() => new Map((tasksQuery.data ?? []).map((task) => [task.id, task] as const)), [tasksQuery.data]);
  const statusById = useMemo(
    () => new Map((tasksQuery.data ?? []).map((task) => [task.id, task.status] as const)),
    [tasksQuery.data],
  );
  const pickIds = useMemo(
    () =>
      layoutPickIds({
        dayPlanPicks: plan.dayPlan?.picks ?? null,
        suggestedIds: plan.picks.map((pick) => pick.task.id),
        statusById,
      }),
    [plan.dayPlan, plan.picks, statusById],
  );
  const proposal = useMemo(() => {
    if (!enabled || !plan.enabled) return null;
    const layoutTasks = pickIds
      .map((id) => taskById.get(id))
      .filter((task): task is NonNullable<typeof task> => task !== undefined);
    const base = {
      picks: layoutTasks.map((task) => ({
        id: task.id,
        estimateMin: task.estimateMin ?? null,
        energy: task.energy ?? null,
        domainId: task.domainId ?? null,
        createdAt: task.createdAt,
      })),
      window,
      fixedBlocks: fixedBlocks.map((block) => ({ start: block.start.getTime(), end: block.end.getTime() })),
      anchors: anchors.map((anchor) => ({ start: anchor.start.getTime(), end: anchor.end.getTime(), domainId: anchor.domainId })),
      now,
      stepMin,
    };
    // With focus blocks already on the agenda, "propose" means replan from now:
    // picks whose block started stay put, so the same work is never re-laid.
    if (focusInWindow.length > 0) {
      const result = replanFromNow({
        ...base,
        existingFocusBlocks: focusInWindow.map((block) => ({
          start: block.start.getTime(),
          end: block.end.getTime(),
          taskId: block.taskId ?? null,
        })),
      });
      return {
        blocks: result.relaid,
        unplaced: result.overflow.map((pick) => ({ id: pick.id, estimateMin: pick.estimateMin ?? null })),
        replanned: true,
        overflow: result.overflow.map((pick) => pick.id),
        keptCount: result.kept.length,
      };
    }
    const result = proposeLayout(base);
    return {
      blocks: result.blocks,
      unplaced: result.unplaced.map((pick) => ({ id: pick.id, estimateMin: pick.estimateMin ?? null })),
      replanned: false,
      overflow: [],
      keptCount: 0,
    };
  }, [enabled, plan.enabled, pickIds, taskById, window, fixedBlocks, anchors, focusInWindow, now, stepMin]);

  return {
    enabled,
    dayKey,
    window: { start: window.start, end: window.end },
    wakingHours,
    blocks,
    fixedBlocks,
    focusBlocks,
    focusInWindow,
    anchors,
    hasPlan: Boolean(plan.dayPlan),
    proposal,
    pickIds,
  };
}

function invalidate(qc: ReturnType<typeof useQueryClient>, dayKey: string) {
  void qc.invalidateQueries({ queryKey: ['timelineBlocks', dayKey] });
  void qc.invalidateQueries({ queryKey: ['blocks'] });
}

/** Create/update/delete a fixed commitment. */
export function useFixedBlockMutations(dayKey: string) {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (input: BlockInput) => blockRepo.create(input),
    onSuccess: () => invalidate(qc, dayKey),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<BlockInput> }) => blockRepo.update(id, patch),
    onSuccess: () => invalidate(qc, dayKey),
  });
  const remove = useMutation({
    mutationFn: (id: string) => blockRepo.delete(id),
    onSuccess: () => invalidate(qc, dayKey),
  });
  return {
    createBlock: create.mutateAsync,
    updateBlock: update.mutateAsync,
    deleteBlock: remove.mutateAsync,
  };
}

/**
 * Replace the day's focus blocks with a proposed layout in one transaction, and
 * return picked tasks that did not fit back to `next`.
 */
export function useApplyLayout(dayKey: string, wakingHours: WakingHours) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      blocks: ProposedBlock[];
      overflowTaskIds?: string[];
      now?: number;
    }) => {
      const window = wakingWindow(dayKey, wakingHours);
      await commitLayout({
        dayKey,
        window,
        now: input.now ?? Date.now(),
        blocks: input.blocks,
        overflowTaskIds: input.overflowTaskIds,
      });
    },
    onSuccess: () => {
      invalidate(qc, dayKey);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['plan'] });
    },
  });
}

export type { Interval };
