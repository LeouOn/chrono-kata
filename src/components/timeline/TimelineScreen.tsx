'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useSettings } from '@/hooks/useSettings';
import { useTasks } from '@/hooks/useTasks';
import { useTodayKey } from '@/hooks/usePlanning';
import { useTimeline, useFixedBlockMutations, useApplyLayout, TIMELINE_STEP_MIN } from '@/hooks/useTimeline';
import { toLocalDateString } from '@/lib/utils/date';
import { useNow } from '@/hooks/useNow';
import { assignLanes, detectConflicts, snapToStep } from '@/lib/planning/layout';
import { Timeline, toTimelineBlocks, type TimelineBlock } from './Timeline';
import { BlockSheet } from './BlockSheet';
import type { Block } from '@/lib/schemas/block';

const MIN = 60_000;

interface Props {
  dayKey?: string;
}

/**
 * /timeline — the day view (roadmap W7 PR 2): commitments, anchors, focus
 * blocks, a now line, and an "apply a proposed layout" flow. Drag/resize is PR 3.
 */
export function TimelineScreen({ dayKey: injectedDayKey }: Props) {
  const liveDay = useTodayKey();
  const dayKey = injectedDayKey ?? liveDay;
  const { settings } = useSettings();
  const [stepMin, setStepMin] = useState<number>(TIMELINE_STEP_MIN);
  const timeline = useTimeline(dayKey, settings, stepMin);
  const { data: tasks = [] } = useTasks({ enabled: timeline.enabled });
  const { createBlock, updateBlock, deleteBlock } = useFixedBlockMutations(dayKey);
  const applyLayout = useApplyLayout(dayKey, timeline.wakingHours);

  const [preview, setPreview] = useState(false);
  const [sheet, setSheet] = useState<
    | { mode: 'new'; kind: 'fixed'; start: number; end: number }
    | { mode: 'edit'; block: Block; kind: 'fixed' | 'focus' }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [anchorNotice, setAnchorNotice] = useState(false);
  const [outsideNotice, setOutsideNotice] = useState<string | null>(null);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task] as const)), [tasks]);
  const clock = (instant: number) => {
    const date = new Date(instant);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };
  const allEntries = useMemo(
    () =>
      // A focus block shows its task's current name: a rename is visible without
      // rewriting the block, and applied blocks are not all called "Focus".
      toTimelineBlocks([...timeline.fixedBlocks, ...timeline.focusBlocks], timeline.anchors).map((entry) =>
        entry.kind === 'focus' && entry.block?.taskId
          ? { ...entry, title: taskById.get(entry.block.taskId)?.title ?? entry.title }
          : entry,
      ),
    [timeline.fixedBlocks, timeline.focusBlocks, timeline.anchors, taskById],
  );
  const entries = useMemo(
    () =>
      assignLanes(
        allEntries.filter((entry) => entry.end > timeline.window.start && entry.start < timeline.window.end),
      ),
    [allEntries, timeline.window],
  );
  const conflicts = useMemo(
    () =>
      detectConflicts(
        entries.map((entry) => ({ start: entry.start, end: entry.end })),
        timeline.window,
      ),
    [entries, timeline.window],
  );
  const conflictingEntries = useMemo(() => {
    const keys = new Set<string>();
    for (const conflict of conflicts) {
      for (const block of conflict.blocks) keys.add(`${block.start}-${block.end}`);
    }
    return entries.map((entry) => ({ ...entry, conflicting: keys.has(`${entry.start}-${entry.end}`) }));
  }, [entries, conflicts]);
  // Never hide data: commitments that sit outside the waking window belong to
  // this day but cannot be drawn on the timeline. They are listed below it.
  const outsideEntries = useMemo(
    () =>
      allEntries.filter(
        (entry) =>
          (entry.end <= timeline.window.start || entry.start >= timeline.window.end) &&
          entry.block &&
          toLocalDateString(entry.block.start) === dayKey,
      ),
    [allEntries, timeline.window, dayKey],
  );
  const ghosts = useMemo(() => {
    if (!preview || !timeline.proposal) return [];
    return timeline.proposal.blocks.map((block) => ({
      taskId: block.taskId,
      start: block.start,
      end: block.end,
      title: taskById.get(block.taskId)?.title ?? 'Focus',
    }));
  }, [preview, timeline.proposal, taskById]);
  const now = useNow();
  const sheetInitial = sheet
    ? sheet.mode === 'new'
      ? { kind: sheet.kind, title: '', start: sheet.start, end: sheet.end }
      : { id: sheet.block.id, kind: sheet.kind, title: sheet.block.title, start: sheet.block.start.getTime(), end: sheet.block.end.getTime() }
    : null;

  if (!timeline.enabled) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-2xl text-text">Timeline</h1>
        <p className="text-sm text-text-muted">
          Time blocking is part of the planning preview. Turn it on in Settings.
        </p>
      </div>
    );
  }

  function openNew() {
    setOutsideNotice(null);
    setApplyNotice(null);
    const start = snapToStep(Math.max(now, timeline.window.start) + 60 * MIN, TIMELINE_STEP_MIN, 'up');
    setSheet({ mode: 'new', kind: 'fixed', start, end: start + 60 * MIN });
  }

  function openBlock(entry: TimelineBlock) {
    if (entry.kind === 'anchor') {
      setAnchorNotice(true);
      return;
    }
    if (!entry.block) return;
    setOutsideNotice(null);
    setApplyNotice(null);
    setSheet({ mode: 'edit', block: entry.block, kind: entry.block.kind === 'focus' ? 'focus' : 'fixed' });
  }

  async function saveBlock(fields: { title: string; start: number; end: number }) {
    if (!sheet) return;
    if (sheet.mode === 'new') {
      await createBlock({
        start: new Date(fields.start),
        end: new Date(fields.end),
        kind: 'fixed',
        title: fields.title,
      });
    } else {
      await updateBlock({ id: sheet.block.id, patch: { title: fields.title, start: new Date(fields.start), end: new Date(fields.end) } });
    }
    const outside =
      fields.end <= timeline.window.start || fields.start >= timeline.window.end;
    setOutsideNotice(
      outside ? 'Saved. It is outside your waking hours, so it is listed below the timeline.' : null,
    );
    setSheet(null);
  }

  async function removeBlock() {
    if (!sheet || sheet.mode !== 'edit') return;
    await deleteBlock(sheet.block.id);
    setOutsideNotice(null);
    setSheet(null);
  }

  async function apply() {
    if (!timeline.proposal || applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    setError(null);
    try {
      const overflow = timeline.proposal.overflow;
      await applyLayout.mutateAsync({
        blocks: timeline.proposal.blocks,
        overflowTaskIds: overflow,
        now,
      });
      setPreview(false);
      setApplyNotice(
        overflow.length > 0
          ? timeline.hasPlan
            ? `Applied. ${overflow.length} pick${overflow.length === 1 ? ' is' : 's are'} back on your list.`
            : `Applied. ${overflow.length} pick${overflow.length === 1 ? ' did' : 's did'} not fit today.`
          : 'Applied. Your day is updated.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply the layout.');
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  }

  async function commitTimes(entry: TimelineBlock, next: { start: number; end: number }) {
    setError(null);
    setApplyNotice(null);
    try {
      if (entry.block) {
        await updateBlock({
          id: entry.block.id,
          patch: { start: new Date(next.start), end: new Date(next.end) },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move the block.');
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-text mb-1">Timeline</h1>
          <p className="text-xs text-text-muted">{dayKey}</p>
        </div>
        <Link href="/plan" className="text-xs text-accent min-h-11 flex items-center">
          Plan
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" className="min-h-11 border border-border bg-surface text-sm" onClick={openNew}>
          Add a commitment
        </Button>
        <Button
          variant="ghost"
          className="min-h-11 border border-border bg-surface text-sm"
          onClick={() => setPreview((value) => !value)}
        >
          {preview ? 'Hide proposed layout' : timeline.focusInWindow.length > 0 ? 'Replan from now' : 'Propose a layout for today’s picks'}
        </Button>
        <div className="flex items-center gap-1 min-h-11" role="group" aria-label="Drag snap">
          {[5, 15].map((step) => (
            <button
              key={step}
              type="button"
              aria-pressed={stepMin === step}
              onClick={() => setStepMin(step)}
              className={`min-h-11 rounded-xl border px-3 text-sm ${stepMin === step ? 'border-accent bg-accent/10 text-text' : 'border-border bg-surface text-text-muted'}`}
            >
              Snap {step}
            </button>
          ))}
        </div>
      </div>

      {preview && timeline.proposal ? (
        <Card className="space-y-1">
          <p className="text-sm text-text">
            {timeline.proposal.blocks.length === 0
              ? timeline.proposal.replanned
                ? 'Nothing left to move. Started blocks stay where they are.'
                : 'Nothing fits in the rest of today.'
              : timeline.proposal.replanned
                ? `${timeline.proposal.blocks.length} block${timeline.proposal.blocks.length === 1 ? '' : 's'} will move after now${timeline.proposal.keptCount > 0 ? `; ${timeline.proposal.keptCount} already started and stay put` : ''}.`
                : `${timeline.proposal.blocks.length} focus block${timeline.proposal.blocks.length === 1 ? '' : 's'} proposed for the rest of today.`}
          </p>
          {!timeline.proposal.replanned && timeline.proposal.unplaced.length > 0 ? (
            <p className="text-xs text-text-muted">
              {timeline.proposal.unplaced.length} pick
              {timeline.proposal.unplaced.length === 1 ? ' does' : 's do'} not fit and will stay on your list.
            </p>
          ) : null}
          {timeline.proposal.overflow.length > 0 ? (
            <p className="text-xs text-text-muted">
              {timeline.hasPlan
                ? `${timeline.proposal.overflow.length} pick${timeline.proposal.overflow.length === 1 ? '' : 's'} will go back to your list.`
                : `${timeline.proposal.overflow.length} pick${timeline.proposal.overflow.length === 1 ? '' : 's'} did not fit today.`}
            </p>
          ) : null}
          <div className="flex gap-2 pt-1">
            <Button onClick={() => void apply()} disabled={applying || (timeline.proposal.blocks.length === 0 && timeline.proposal.overflow.length === 0)}>
              {applying ? 'Applying…' : timeline.proposal.replanned ? 'Apply replan' : 'Apply this layout'}
            </Button>
            <Button variant="ghost" onClick={() => setPreview(false)} disabled={applying}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {applyNotice ? (
        <p role="status" className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text">
          {applyNotice}
        </p>
      ) : null}

      {outsideNotice ? (
        <p role="status" className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text">
          {outsideNotice}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-hype">
          {error}
        </p>
      ) : null}

      {anchorNotice ? (
        <div role="status" className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text">
          Protected windows are set in{' '}
          <Link href="/settings" className="text-accent">
            Settings &gt; Planning
          </Link>
          . They are shown here so you can plan around them.
          <button
            type="button"
            className="ml-2 text-xs text-text-muted underline min-h-11"
            onClick={() => setAnchorNotice(false)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {conflicts.length > 0 ? (
        <Card className="space-y-1">
          <h2 className="text-xs uppercase tracking-wide text-text-muted">
            {conflicts.length === 1 ? 'One time overlap' : `${conflicts.length} time overlaps`}
          </h2>
          <ul className="space-y-1">
            {conflicts.map((conflict, index) => {
              const [a, b] = conflict.blocks;
              const sharedStart = a && b ? Math.max(a.start, b.start) : null;
              const sharedEnd = a && b ? Math.min(a.end, b.end) : null;
              return (
                <li key={`${conflict.kind}-${index}`} className="text-xs text-text-muted">
                  {conflict.kind === 'overlap' && sharedStart != null && sharedEnd != null
                    ? `These blocks share ${clock(sharedStart)}–${clock(sharedEnd)}.`
                    : 'A block sits partly outside your waking hours.'}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-text-muted">
            Move it, shorten it, or leave it as it is — nothing changes on its own.
          </p>
        </Card>
      ) : null}

      <Card>
        <Timeline
          window={timeline.window}
          blocks={conflictingEntries}
          ghostBlocks={ghosts}
          now={now}
          onSelect={openBlock}
          onCommit={(entry, next) => commitTimes(entry, next)}
          stepMin={stepMin}
        />
      </Card>
      <p id="timeline-hint" className="text-[11px] text-text-muted">
        Tap a block to edit its times. Drag a block to move it, or use the top/bottom handles to resize;
        with a block focused, Alt+Up/Down moves it and Shift+Alt+Up/Down changes its end. Escape cancels.
      </p>

      {outsideEntries.length > 0 ? (
        <Card className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-text-muted">Outside your waking hours</h2>
          <ul className="space-y-2">
            {outsideEntries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => openBlock(entry)}
                  aria-label={`outside block ${entry.title} ${clock(entry.start)} to ${clock(entry.end)}`}
                  className="w-full min-h-11 rounded-xl border border-border bg-surface-2 px-3 py-2 text-left text-sm text-text"
                >
                  <span className="block truncate font-medium">{entry.title}</span>
                  <span className="block text-[11px] text-text-muted">
                    {clock(entry.start)}–{clock(entry.end)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-text-muted">
            These are kept on this day, but they fall outside the waking hours you set.
          </p>
        </Card>
      ) : null}

      {sheet ? (
        <BlockSheet
          key={sheet.mode === 'edit' ? sheet.block.id : `new-${sheet.start}`}
          open
          initial={sheetInitial ?? undefined}
          window={timeline.window}
          focusTaskTitle={
            sheet && sheet.mode === 'edit' && sheet.block.taskId
              ? taskById.get(sheet.block.taskId)?.title
              : undefined
          }
          onClose={() => setSheet(null)}
          onSave={saveBlock}
          onDelete={sheet.mode === 'edit' ? removeBlock : undefined}
        />
      ) : null}
    </div>
  );
}
