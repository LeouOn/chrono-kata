'use client';

import React, { useCallback, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { dispatchToast } from '@/components/ui/Toast';
import { useFlag } from '@/hooks/useFlags';
import { useSettings } from '@/hooks/useSettings';
import { blockRepo } from '@/lib/db/block.repo';
import { blocksToIcs } from '@/lib/ics/ics-export';
import { icsToBlocks } from '@/lib/ics/ics-import';
import {
  buildImportPreview,
  ICS_MAX_EVENTS,
  ICS_MAX_FILE_BYTES,
  validateSubscriptionUrl,
  withSkips,
  type ImportPreview,
} from '@/lib/ics/calendar-io';
import { toLocalDateString } from '@/lib/utils/date';
import type { Block } from '@/lib/schemas/block';

/**
 * Calendar interop (roadmap Wave 8 part 2, behind `taskInbox`): export fixed
 * blocks as .ics, import commitments from a file or an https subscription
 * address. Nothing is written until the preview is confirmed; a re-import
 * updates existing calendar blocks by their calendarRef and never touches
 * blocks made by hand.
 */

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function localWeekWindow(now: Date): { start: Date; end: Date } {
  const start = startOfLocalDay(now);
  const dow = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - dow);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

const FETCH_TIMEOUT_MS = 15_000;

/** Reject after `ms` regardless of the underlying promise (own deadline, so a
 * hung server cannot pin busy/Refresh; testable under fake timers). */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('deadline')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Download (web) / share (WebView with Web Share) / clipboard, in that order. */
async function offerIcsDownload(filename: string, text: string): Promise<'downloaded' | 'shared' | 'copied'> {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const nav = navigator as Navigator & { canShare?: (data: { files?: File[] }) => boolean };
  const file = new File([blob], filename, { type: 'text/calendar' });
  if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    await nav.share({ files: [file], title: filename });
    return 'shared';
  }
  if (typeof document !== 'undefined' && typeof URL.createObjectURL === 'function') {
    // Web / WebView without share: classic download.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return 'downloaded';
  }
  // Last resort (no DOM download in this context): put the text on the clipboard.
  await navigator.clipboard.writeText(text);
  return 'copied';
}

export function CalendarInteropSettings() {
  const enabled = useFlag('taskInbox');
  const queryClient = useQueryClient();
  const { settings, updateSettings } = useSettings();
  const urlId = useId();
  const fileId = useId();

  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [parseMessage, setParseMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const applyingRef = useRef(false); // double-submit guard (REF, not state)
  const remembered = settings?.icsSubscriptionUrl ?? '';
  const [addressDraft, setAddressDraft] = useState(remembered);
  const [remember, setRemember] = useState(remembered !== '');
  // Sync the draft once the settings row arrives (first paint may precede it).
  const settingsArrivedRef = useRef(false);
  if (settings != null && !settingsArrivedRef.current) {
    settingsArrivedRef.current = true;
    if (addressDraft === '' && remembered !== '') setAddressDraft(remembered);
    if (remembered !== '') setRemember(true);
  }

  const blocksQuery = useQuery({
    queryKey: ['blocks'],
    queryFn: async (): Promise<Block[] | null> => {
      try {
        return await blockRepo.getAll();
      } catch {
        return null; // react-query v5: undefined is an error; null means "could not read"
      }
    },
    enabled,
    staleTime: 30_000,
  });

  const parseAndPreview = useCallback(
    (text: string, label: string, existing: Block[]) => {
      if (text.length > ICS_MAX_FILE_BYTES) {
        setPreview(null);
        setParseMessage(`That file is larger than the ${Math.round(ICS_MAX_FILE_BYTES / 1024 / 1024)} MB limit.`);
        return;
      }
      const result = icsToBlocks(text, { now: new Date(), defaultKind: 'fixed' });
      if (result.blocks.length > ICS_MAX_EVENTS) {
        setPreview(null);
        setParseMessage(`That calendar has more than ${ICS_MAX_EVENTS} events in range. Import a smaller window.`);
        return;
      }
      const base = buildImportPreview(result.blocks, existing, result.window);
      const withReasons = withSkips(base, result.skipped);
      setPreview(withReasons);
      setSourceLabel(label);
      const { new: n, updated, unchanged, skipped } = withReasons.counts;
      setParseMessage(
        withReasons.entries.length + skipped === 0
          ? 'No events in range. Nothing to import.'
          : `${withReasons.entries.length} events found: ${n} new, ${updated} updated, ${unchanged} unchanged, ${skipped} skipped.`,
      );
    },
    [],
  );

  /** Fresh blocks at event time — read straight from the repository (cheap),
   * never from the query cache, so a change made on another screen inside
   * the cache lifetime cannot make the preview classify against old data. */
  const currentBlocks = useCallback(async (): Promise<Block[]> => {
    return blockRepo.getAll();
  }, []);

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (file.size > ICS_MAX_FILE_BYTES) {
        setPreview(null);
        setParseMessage(`That file is larger than the ${Math.round(ICS_MAX_FILE_BYTES / 1024 / 1024)} MB limit.`);
        return;
      }
      try {
        const text = await file.text();
        parseAndPreview(text, file.name, await currentBlocks());
      } catch {
        setPreview(null);
        setParseMessage('That file could not be read.');
      }
    },
    [parseAndPreview, currentBlocks],
  );

  if (!enabled) return null;

  const existing = blocksQuery.data ?? [];

  async function exportBlocks(range: 'today' | 'week') {
    const now = new Date();
    const window = range === 'today'
      ? { start: startOfLocalDay(now), end: new Date(startOfLocalDay(now).getTime() + 24 * 3600 * 1000) }
      : localWeekWindow(now);
    // Read fresh at click time, like the import path: the render-time cache
    // may lag a change made on another screen.
    const all = await currentBlocks();
    const inRange = all.filter(
      (b) => b.end > window.start && b.start < window.end,
    );
    if (inRange.length === 0) {
      dispatchToast('No blocks in that range to export yet.', 'info');
      return;
    }
    const text = blocksToIcs(inRange, { now });
    const filename = `chrono-kata-${range}-${toLocalDateString(now)}.ics`;
    try {
      const how = await offerIcsDownload(filename, text);
      dispatchToast(
        how === 'shared' ? 'Shared the calendar file.' : how === 'copied' ? 'Calendar text copied.' : 'Calendar file downloaded.',
        'success',
      );
    } catch {
      dispatchToast('Could not hand off the calendar file.', 'error');
    }
  }

  async function onConfirm() {
    if (!preview || preview.toWrite.length === 0) return;
    if (applyingRef.current) return; // second click in one act() is a no-op
    applyingRef.current = true;
    setBusy(true);
    try {
      const toWrite = preview.toWrite;
      await blockRepo.applyCalendarImport(toWrite);
      // Seed the cache so a refetch never flashes an empty list.
      queryClient.setQueryData<Block[]>(['blocks'], (current) => {
        if (!current) return current;
        const byId = new Map(current.map((b) => [b.id, b]));
        for (const b of toWrite) byId.set(b.id, b);
        return [...byId.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
      });
      // Finish the visible state BEFORE awaiting anything else: a late
      // invalidation tail must never reset a preview the user just started.
      setPreview(null);
      setSourceLabel(null);
      setParseMessage(null);
      dispatchToast(`Imported ${toWrite.length} calendar block${toWrite.length === 1 ? '' : 's'}.`, 'success');
      void queryClient.invalidateQueries({ queryKey: ['blocks'] });
    } catch (error) {
      dispatchToast(error instanceof Error ? error.message : 'The import could not be saved.', 'error');
    } finally {
      applyingRef.current = false;
      setBusy(false);
    }
  }

  async function fetchSubscription(raw: string) {
    const check = validateSubscriptionUrl(raw);
    if (!check.ok) {
      setParseMessage(check.reason);
      return;
    }
    if (applyingRef.current) return;
    applyingRef.current = true;
    setBusy(true);
    try {
      // Phase 1 — the network call, with its own error copy: deadline of our
      // own (testable under fake timers) plus the wire-level abort, so a
      // server that never answers cannot leave Refresh stuck.
      let response: Response;
      try {
        response = await withDeadline(
          fetch(check.url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
          FETCH_TIMEOUT_MS,
        );
      } catch (error) {
        if (error instanceof TypeError) {
          // Network/CORS class: browsers block most calendar providers.
          setParseMessage('Some calendar providers do not allow this from an app; import the file instead.');
        } else {
          setParseMessage('The calendar address took too long to answer. Nothing was changed.');
        }
        return;
      }
      if (!response.ok) {
        setParseMessage(`The calendar address answered ${response.status}. Nothing was changed.`);
        return;
      }
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > ICS_MAX_FILE_BYTES) {
        setParseMessage(`That calendar is larger than the ${Math.round(ICS_MAX_FILE_BYTES / 1024 / 1024)} MB limit. Import a file instead.`);
        return;
      }
      // Phase 2 — reading and parsing have their own calm copy.
      let text: string;
      try {
        text = await response.text();
      } catch {
        setParseMessage('That calendar could not be read. Nothing was changed.');
        return;
      }
      try {
        parseAndPreview(text, check.url, await currentBlocks());
      } catch {
        setParseMessage('That calendar could not be read. Nothing was changed.');
        return;
      }
      // Phase 3 — remembering the address must never replace a good preview
      // with a failure message; a rejected settings write only toasts.
      if (remember && check.url !== remembered) {
        try {
          await updateSettings({ icsSubscriptionUrl: check.url });
        } catch (error) {
          dispatchToast(error instanceof Error ? error.message : 'Could not remember this address.', 'error');
        }
      }
    } finally {
      applyingRef.current = false;
      setBusy(false);
    }
  }

  async function rememberAddress(raw: string, remember: boolean) {
    // Only a validated https URL is ever written; unchecking clears the field.
    if (!remember) {
      await updateSettings({ icsSubscriptionUrl: null });
      return;
    }
    const check = validateSubscriptionUrl(raw);
    if (!check.ok) {
      setParseMessage(check.reason);
      // The box must not claim something was stored when it was not.
      setRemember(false);
      return;
    }
    await updateSettings({ icsSubscriptionUrl: check.url });
  }

  return (
    <Card>
      <h2 className="font-serif text-lg text-text">Calendar</h2>
      <p className="mt-1 text-xs text-text-muted">
        Bring your commitments in from any calendar app (.ics), or share your blocks out. Nothing is saved until you confirm.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" className="min-h-11" onClick={() => void exportBlocks('today')}>
          Export today
        </Button>
        <Button variant="ghost" className="min-h-11" onClick={() => void exportBlocks('week')}>
          Export this week
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <label htmlFor={fileId} className="block text-sm text-text">
          Import from a file
        </label>
        <input
          id={fileId}
          type="file"
          accept=".ics,text/calendar"
          className="block w-full text-sm text-text file:mr-3 file:rounded-xl file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:min-h-11 file:text-text"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
      </div>

      <div className="mt-4 space-y-2">
        <label htmlFor={urlId} className="block text-sm text-text">
          Or a calendar address (https)
        </label>
        <div className="flex gap-2">
          <input
            id={urlId}
            type="url"
            inputMode="url"
            placeholder="https://example.com/calendar.ics"
            className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text"
            value={addressDraft}
            onChange={(event) => setAddressDraft(event.target.value)}
          />
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={busy}
            onClick={() => void fetchSubscription(addressDraft)}
          >
            Refresh
          </Button>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            className="size-5"
            checked={remember}
            aria-label="Remember this address"
            onChange={(event) => {
              const next = event.target.checked;
              setRemember(next);
              void rememberAddress(addressDraft, next);
            }}
          />
          Remember this address (stored on this device only)
        </label>
      </div>

      {parseMessage && (
        <p role="status" className="mt-3 text-sm text-text">
          {parseMessage}
        </p>
      )}

      {preview && (
        <div className="mt-3 space-y-2" data-testid="ics-preview">
          <p className="text-sm text-text">
            {preview.counts.new} new · {preview.counts.updated} updated · {preview.counts.unchanged} unchanged · {preview.counts.skipped} skipped
            {sourceLabel ? ` — from ${sourceLabel}` : ''}
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-xs text-text-muted">
            {preview.entries.slice(0, 50).map((entry) => (
              <li key={entry.block.id} className="flex justify-between gap-2">
                <span className="truncate">{entry.block.title}</span>
                <span className="shrink-0">{entry.verdict}</span>
              </li>
            ))}
            {preview.skipped.slice(0, 10).map((skip, index) => (
              <li key={`skip-${index}`} className="flex justify-between gap-2">
                <span className="truncate">{skip.summary ?? 'an event'}</span>
                <span className="shrink-0" title={skip.reason}>skipped</span>
              </li>
            ))}
            {preview.entries.length + preview.skipped.length > 60 && (
              <li className="text-text-muted">and {preview.entries.length + preview.skipped.length - 60} more</li>
            )}
          </ul>
          {preview.toWrite.length > 0 && (
            <Button className="min-h-11 w-full" disabled={busy} onClick={() => void onConfirm()}>
              Save {preview.toWrite.length} block{preview.toWrite.length === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
