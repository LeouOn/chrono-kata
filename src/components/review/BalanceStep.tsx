'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { INTENTION_MAX_MINUTES } from '@/lib/review/limits';
import type { Intentions } from '@/lib/review/decisions';
import type { Domain } from '@/lib/schemas/domain';
import type { WeeklyStats } from '@/lib/review/stats';
import { formatDuration } from '@/lib/utils/format';

interface Props {
  rows: WeeklyStats['domainBalance'];
  domains: Domain[];
  intentions: Intentions;
  unassignedMinutes: number;
  onChange: (domainId: string, minutes: number | null) => void;
}

/**
 * Step 4 of the review: time per domain against the intention that was stated
 * for the week. Nothing is a score: an untouched area is simply 0 minutes, and
 * the intention can be adjusted here.
 */
export function BalanceStep({ rows, domains, intentions, unassignedMinutes, onChange }: Props) {
  const nameById = new Map(domains.map((domain) => [domain.id, domain.name] as const));
  const widest = Math.max(1, ...rows.map((row) => Math.max(row.minutes, row.intended ?? 0)));

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        The aim comes from last week&apos;s review; adjust it here if it changed. Time is counted from the sessions
        linked to a task or project in that domain.
      </p>
      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">No domains yet, so there is nothing to balance.</p>
        </Card>
      ) : null}
      {rows.map((row) => {
        const name = nameById.get(row.domainId) ?? 'Domain';
        const intended = intentions[row.domainId] ?? null;
        const delta = intended == null ? null : row.minutes - intended;
        return (
          <Card key={row.domainId}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 break-words font-serif text-base text-text">{name}</p>
              <span className="shrink-0 text-sm text-text">{formatDuration(row.minutes)}</span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(row.minutes / widest) * 100}%` }}
                />
              </div>
              {intended != null ? (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div
                    className="h-full rounded-full bg-text-muted/40"
                    style={{ width: `${(intended / widest) * 100}%` }}
                  />
                </div>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-text-muted">
              {intended == null
                ? 'No aim set for this week.'
                : delta === 0
                  ? `Aim ${formatDuration(intended)} · right on it.`
                  : `Aim ${formatDuration(intended)} · ${formatDuration(Math.abs(delta!))} ${delta! > 0 ? 'above' : 'below'} the aim.`}
            </p>
            <label className="mt-2 block text-xs text-text-muted" htmlFor={`intention-${row.domainId}`}>
              Minutes you aimed for in {name} this week
            </label>
            <input
              id={`intention-${row.domainId}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={INTENTION_MAX_MINUTES}
              step={5}
              value={intended ?? ''}
              placeholder="no aim"
              onChange={(event) => {
                const raw = event.target.value;
                if (raw.trim() === '') {
                  onChange(row.domainId, null);
                  return;
                }
                const parsed = Number(raw);
                if (!Number.isFinite(parsed)) return;
                onChange(row.domainId, Math.min(INTENTION_MAX_MINUTES, Math.max(0, Math.round(parsed))));
              }}
              className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3 py-3 text-text"
            />
          </Card>
        );
      })}
      {unassignedMinutes > 0 ? (
        <p className="text-xs text-text-muted">
          {formatDuration(unassignedMinutes)} this week went to sessions with no task or project, so it is not counted
          in a domain.
        </p>
      ) : null}
    </div>
  );
}
