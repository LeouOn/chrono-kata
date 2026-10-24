'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blockRepo } from '@/lib/db/block.repo';
import { useFlag } from '@/hooks/useFlags';
import { usePlanToday } from '@/hooks/usePlanning';
import { resolveAnchors, resolveWakingHours } from '@/lib/planning/resolve';
import { anchorsWithinWindow } from '@/lib/planning/anchors';
import type { AnchorInterval as DatedAnchor } from '@/lib/planning/anchors';
import { localDayStart, wakingWindow, localWallClockToEpoch } from '@/lib/planning/time';
import { toLocalDateString } from '@/lib/utils/date';
import { addDays } from '@/lib/pacing/days';
import { proposeLayout, type Interval, type ProposedBlock } from '@/lib/planning/layout';
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
  proposal: { blocks: ProposedBlock[]; unplaced: { id: string; estimateMin?: number | null }[] } | null;
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
export function useTimeline(dayKey: string, settings: Settings | null | undefined): TimelineView {
  const enabled = useFlag('taskInbox');
  const wakingHours = useMemo(() => resolveWakingHours(settings), [settings]);
  const anchorDefs = useMemo(() => resolveAnchors(settings), [settings]);
  const window = useMemo(() => wakingWindow(dayKey, wakingHours), [dayKey, wakingHours]);
  const anchors = useMemo(() => anchorsWithinWindow(anchorDefs, dayKey, window), [anchorDefs, dayKey, window]);
  const blocksQuery = useDayBlocks(dayKey);
  const plan = usePlanToday(dayKey);

  const blocks = blocksQuery.data ?? [];
  const fixedBlocks = blocks.filter((block) => block.kind === 'fixed');
  const focusBlocks = blocks.filter((block) => block.kind === 'focus');

  const proposal = useMemo(() => {
    if (!enabled || !plan.enabled) return null;
    return proposeLayout({
      picks: plan.picks.map((pick) => ({
        id: pick.task.id,
        estimateMin: pick.task.estimateMin ?? null,
        energy: pick.task.energy ?? null,
        domainId: pick.task.domainId ?? null,
        createdAt: pick.task.createdAt,
      })),
      window,
      fixedBlocks: fixedBlocks.map((block) => ({ start: block.start.getTime(), end: block.end.getTime() })),
      anchors: anchors.map((anchor) => ({ start: anchor.start.getTime(), end: anchor.end.getTime(), domainId: anchor.domainId })),
      now: Date.now(),
      stepMin: TIMELINE_STEP_MIN,
    });
  }, [enabled, plan.enabled, plan.picks, window, fixedBlocks, anchors]);

  return {
    enabled,
    dayKey,
    window: { start: window.start, end: window.end },
    wakingHours,
    blocks,
    fixedBlocks,
    focusBlocks,
    anchors,
    proposal: proposal ? { blocks: proposal.blocks, unplaced: proposal.unplaced } : null,
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
    mutationFn: async ({ blocks }: { blocks: ProposedBlock[] }) => {
      const window = wakingWindow(dayKey, wakingHours);
      await blockRepo.replaceFutureFocus({ start: new Date(window.start), end: new Date(window.end) }, new Date(), blocks);
    },
    onSuccess: () => {
      invalidate(qc, dayKey);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['plan'] });
    },
  });
}

export type { Interval };
