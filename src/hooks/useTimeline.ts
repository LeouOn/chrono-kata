'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blockRepo } from '@/lib/db/block.repo';
import { useFlag } from '@/hooks/useFlags';
import { usePlanToday } from '@/hooks/usePlanning';
import { resolveAnchors, resolveWakingHours } from '@/lib/planning/resolve';
import { anchorsWithinWindow } from '@/lib/planning/anchors';
import type { AnchorInterval as DatedAnchor } from '@/lib/planning/anchors';
import { wakingWindow } from '@/lib/planning/time';
import { proposeLayout, type Interval, type ProposedBlock } from '@/lib/planning/layout';
import type { Block, BlockInput } from '@/lib/schemas/block';
import type { Settings, WakingHours } from '@/lib/schemas/settings';

export const TIMELINE_STEP_MIN = 15;

export interface TimelineView {
  enabled: boolean;
  dayKey: string;
  window: { start: number; end: number };
  blocks: Block[];
  fixedBlocks: Block[];
  focusBlocks: Block[];
  anchors: DatedAnchor[];
  proposal: { blocks: ProposedBlock[]; unplaced: { id: string; estimateMin?: number | null }[] } | null;
}

/** Blocks that overlap a day's waking window (any kind). Flag-gated. */
export function useDayBlocks(dayKey: string, wakingHours: WakingHours) {
  const enabled = useFlag('taskInbox');
  const window = wakingWindow(dayKey, wakingHours);
  return useQuery({
    queryKey: ['timelineBlocks', dayKey, window.start, window.end],
    queryFn: async () => blockRepo.range(new Date(window.start), new Date(window.end)),
    enabled,
  });
}

/** Everything the timeline renders for one day. */
export function useTimeline(dayKey: string, settings: Settings | null | undefined): TimelineView {
  const enabled = useFlag('taskInbox');
  const wakingHours = useMemo(() => resolveWakingHours(settings), [settings]);
  const anchorDefs = useMemo(() => resolveAnchors(settings), [settings]);
  const window = useMemo(() => wakingWindow(dayKey, wakingHours), [dayKey, wakingHours]);
  const anchors = useMemo(() => anchorsWithinWindow(anchorDefs, dayKey, window), [anchorDefs, dayKey, window]);
  const blocksQuery = useDayBlocks(dayKey, wakingHours);
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
export function useApplyLayout(dayKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ blocks }: { blocks: ProposedBlock[] }) => {
      await blockRepo.replaceFutureFocus(windowDates(dayKey), new Date(), blocks);
    },
    onSuccess: () => {
      invalidate(qc, dayKey);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['plan'] });
    },
  });
}

/** The calendar window the apply transaction scopes itself to. */
function windowDates(dayKey: string): { start: Date; end: Date } {
  const window = wakingWindow(dayKey, { start: '00:00', end: '23:59' });
  return { start: new Date(window.start), end: new Date(window.end) };
}

export type { Interval };
