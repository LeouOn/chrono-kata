'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DotsRatingPicker } from '@/components/session/DotsRatingPicker';
import { useSettings } from '@/hooks/useSettings';
import { useCheckIn, useUpsertCheckIn } from '@/hooks/useCheckIns';
import { toLocalDateString } from '@/lib/utils/date';
import type { CheckIn, CheckInScale } from '@/lib/schemas/check-in';
import type { Rating } from '@/lib/schemas/session';

const ROWS = [
  { key: 'energy', label: 'Energy', low: 'depleted', high: 'energetic' },
  { key: 'fog', label: 'Fog', low: 'clear', high: 'heavy' },
  { key: 'aches', label: 'Aches', low: 'none', high: 'severe' },
  { key: 'sleep', label: 'Sleep', low: 'poor', high: 'restful' },
] as const;

type Scores = {
  energy: CheckInScale | null;
  fog: CheckInScale | null;
  aches: CheckInScale | null;
  sleep: CheckInScale | null;
};

const EMPTY: Scores = { energy: null, fog: null, aches: null, sleep: null };

function scoresFrom(checkIn: CheckIn | null | undefined): Scores {
  if (!checkIn) return EMPTY;
  return {
    energy: checkIn.energy,
    fog: checkIn.fog,
    aches: checkIn.aches,
    sleep: checkIn.sleep,
  };
}

function complete(scores: Scores): scores is {
  energy: CheckInScale;
  fog: CheckInScale;
  aches: CheckInScale;
  sleep: CheckInScale;
} {
  return scores.energy != null && scores.fog != null && scores.aches != null && scores.sleep != null;
}

function summary(checkIn: CheckIn): string {
  return `Energy ${checkIn.energy} · Fog ${checkIn.fog} · Aches ${checkIn.aches} · Sleep ${checkIn.sleep}`;
}

export function MorningCheckIn() {
  const { settings } = useSettings();
  const date = toLocalDateString(new Date());
  const { data: checkIn, isLoading } = useCheckIn(date);
  const upsert = useUpsertCheckIn();
  const [expanded, setExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<Scores>(EMPTY);
  const seeded = useRef(false);

  useEffect(() => {
    if (isLoading || seeded.current) return;
    seeded.current = true;
    setDraft(scoresFrom(checkIn));
    setNote(checkIn?.note ?? '');
    setExpanded(!checkIn);
  }, [isLoading, checkIn]);

  if (settings?.showMorningCheckIn === false) return null;
  if (isLoading || !seeded.current) return null;

  async function save(next: Scores, noteText: string) {
    if (!complete(next)) return;
    await upsert.mutateAsync({
      date,
      energy: next.energy,
      fog: next.fog,
      aches: next.aches,
      sleep: next.sleep,
      note: noteText.trim() || undefined,
    });
    setExpanded(false);
    setNoteOpen(false);
  }

  function choose(key: keyof Scores, value: Rating) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (!noteOpen) void save(next, note);
  }

  if (checkIn && !expanded) {
    return (
      <Card>
        <button
          type="button"
          className="w-full text-left min-h-11"
          onClick={() => {
            setDraft(scoresFrom(checkIn));
            setNote(checkIn.note ?? '');
            setExpanded(true);
          }}
        >
          <div className="text-xs uppercase tracking-wide text-text-muted">This morning</div>
          <div className="text-sm text-text mt-1">{summary(checkIn)}</div>
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">This morning</div>
      <div className="space-y-4">
        {ROWS.map((row) => (
          <div key={row.key}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-sm text-text">{row.label}</span>
              <span className="text-xs text-text-muted">
                {row.low} … {row.high}
              </span>
            </div>
            <DotsRatingPicker
              value={draft[row.key]}
              onChange={(value) => choose(row.key, value)}
              size="lg"
              hideHeader
              ariaPrefix={row.label}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-3 text-xs text-text-muted underline min-h-11"
        onClick={() => setNoteOpen((open) => !open)}
      >
        {noteOpen ? 'Hide note' : 'Add a note'}
      </button>
      {noteOpen && (
        <div className="mt-2 space-y-2">
          <textarea
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            className="w-full bg-surface-2 rounded-xl px-3 py-2 text-text text-sm border border-border focus:border-accent outline-none"
          />
          <Button
            type="button"
            variant="primary"
            disabled={!complete(draft) || upsert.isPending}
            onClick={() => void save(draft, note)}
          >
            Save check-in
          </Button>
        </div>
      )}
    </Card>
  );
}
