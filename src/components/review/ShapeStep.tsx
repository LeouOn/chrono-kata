'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { CADENCE_MAX, INTENTION_MAX_MINUTES, NOTES_MAX } from '@/lib/review/limits';
import type { Intentions } from '@/lib/review/decisions';
import type { Domain } from '@/lib/schemas/domain';
import type { Project } from '@/lib/schemas/project';
import { formatWeekLabel } from '@/lib/review/week';
import { addDays } from '@/lib/pacing/days';
import { ReviewSummary } from './ReviewSummary';
import type { Session } from '@/lib/schemas/session';

interface Props {
  weekOf: string;
  domains: Domain[];
  projects: Project[];
  intentions: Intentions;
  notes: string;
  /** The reviewed week's sessions; the optional AI summary is built from these. */
  sessions: readonly Session[];
  busy: boolean;
  onIntentionChange: (domainId: string, minutes: number | null) => void;
  onCadenceChange: (projectId: string, cadence: number | null) => void;
  onNotesChange: (notes: string) => void;
}

/**
 * Step 6 of the review: shape the week ahead with rough intentions per domain
 * and a rhythm per project. Intentions are saved on this review so next week's
 * review can compare against them; cadence is the project's own field.
 */
export function ShapeStep({
  weekOf,
  domains,
  projects,
  intentions,
  notes,
  sessions,
  busy,
  onIntentionChange,
  onCadenceChange,
  onNotesChange,
}: Props) {
  const nextWeek = formatWeekLabel(addDays(weekOf, 7));
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        Rough numbers are enough. They are a direction for the week of {nextWeek}, not a promise.
      </p>

      <Card>
        <p className="font-serif text-base text-text">Intentions per domain</p>
        <div className="mt-2 space-y-3">
          {domains.length === 0 ? <p className="text-sm text-text-muted">No domains yet.</p> : null}
          {domains.map((domain) => (
            <div key={domain.id} className="flex items-center gap-3">
              <label className="min-w-0 flex-1 break-words text-sm text-text" htmlFor={`next-intention-${domain.id}`}>
                {domain.name}
              </label>
              <input
                id={`next-intention-${domain.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={INTENTION_MAX_MINUTES}
                step={5}
                value={intentions[domain.id] ?? ''}
                placeholder="no aim"
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw.trim() === '') {
                    onIntentionChange(domain.id, null);
                    return;
                  }
                  const parsed = Number(raw);
                  if (!Number.isFinite(parsed)) return;
                  onIntentionChange(domain.id, Math.min(INTENTION_MAX_MINUTES, Math.max(0, Math.round(parsed))));
                }}
                className="w-24 min-h-11 shrink-0 rounded-xl border border-border bg-surface px-3 py-3 text-right text-text"
                aria-label={`Minutes for ${domain.name} next week`}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="font-serif text-base text-text">Project rhythms</p>
        <p className="mt-1 text-xs text-text-muted">How many sessions a week each project wants.</p>
        <div className="mt-2 space-y-3">
          {projects.length === 0 ? <p className="text-sm text-text-muted">No active projects.</p> : null}
          {projects.map((project) => (
            <div key={project.id} className="flex items-center gap-3">
              <label className="min-w-0 flex-1 break-words text-sm text-text" htmlFor={`cadence-${project.id}`}>
                {project.title}
              </label>
              <select
                id={`cadence-${project.id}`}
                value={project.cadencePerWeek ?? ''}
                disabled={busy}
                onChange={(event) => {
                  const raw = event.target.value;
                  onCadenceChange(project.id, raw === '' ? null : Number(raw));
                }}
                className="min-h-11 w-32 shrink-0 rounded-xl border border-border bg-surface px-2 py-2 text-sm text-text"
                aria-label={`Sessions a week for ${project.title}`}
              >
                <option value="">No target</option>
                {Array.from({ length: CADENCE_MAX }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {count} a week
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <label className="block font-serif text-base text-text" htmlFor="review-notes">
          What stood out?
        </label>
        <p className="mt-1 text-xs text-text-muted">Optional. Your own words, kept on this device.</p>
        <textarea
          id="review-notes"
          value={notes}
          maxLength={NOTES_MAX}
          rows={4}
          onChange={(event) => onNotesChange(event.target.value.slice(0, NOTES_MAX))}
          className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-3 text-text"
          placeholder="One thing that worked, one thing to carry forward."
        />
        <p className="mt-1 text-right text-[11px] text-text-muted">
          {notes.length} / {NOTES_MAX}
        </p>
      </Card>

      <ReviewSummary sessions={sessions} notes={notes} onNotesChange={onNotesChange} />
    </div>
  );
}
