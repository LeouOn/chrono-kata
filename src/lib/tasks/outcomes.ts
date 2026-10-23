/**
 * Inbox triage outcomes (roadmap Wave 2 part 2).
 *
 * Pure: given an outcome and its inputs, return the status and field changes.
 * The repository layer applies them, so the six-outcome decision is testable
 * without Dexie or React.
 */

import type { TaskStatus } from '@/lib/schemas/task';

export type InboxOutcome =
  | 'do-now'
  | 'next-action'
  | 'schedule'
  | 'waiting'
  | 'drop'
  | 'make-project';

export interface InboxOutcomeSpec {
  outcome: InboxOutcome;
  /** Keyboard key that triggers it. */
  key: string;
  label: string;
  hint: string;
}

/** Order matters: the UI renders 1-6 in this sequence. */
export const INBOX_OUTCOMES: readonly InboxOutcomeSpec[] = [
  { outcome: 'do-now', key: '1', label: 'Do now', hint: 'Under two minutes' },
  { outcome: 'next-action', key: '2', label: 'Next action', hint: 'Name the next small step' },
  { outcome: 'schedule', key: '3', label: 'Schedule', hint: 'Pick a day' },
  { outcome: 'waiting', key: '4', label: 'Waiting', hint: 'Blocked on someone or something' },
  { outcome: 'drop', key: '5', label: 'Drop', hint: 'Let it go, no guilt' },
  { outcome: 'make-project', key: '6', label: 'Make project', hint: 'It is bigger than one task' },
] as const;

/** Resolve a keyboard key (1-6) to an outcome, or null. */
export function outcomeForKey(key: string): InboxOutcome | null {
  return INBOX_OUTCOMES.find((spec) => spec.key === key)?.outcome ?? null;
}

export interface OutcomeInput {
  /** Required for `next-action`: the one-line next step. */
  nextAction?: string;
  /** Required for `schedule`: the local day it is deferred to. */
  deferUntil?: Date;
}

export interface OutcomeTransition {
  status: TaskStatus;
  patch: {
    nextAction?: string;
    /** A chosen local day, or null to clear a stale one. */
    deferUntil?: Date | null;
  };
}

export type OutcomeResult =
  | { ok: true; transition: OutcomeTransition }
  | { ok: false; error: string };

const NEXT_ACTION_MAX = 500;

/**
 * Map an outcome to a legal task status plus the fields it needs.
 *
 * `deferUntil` is a local-midday Date for the chosen day. Every outcome except
 * `schedule` clears a stale defer date so a re-triaged task cannot keep an old
 * day; `next-action` keeps the previous one out of the way by clearing it too.
 */
export function outcomeTransition(outcome: InboxOutcome, input: OutcomeInput = {}): OutcomeResult {
  switch (outcome) {
    case 'do-now':
      return { ok: true, transition: { status: 'done', patch: { deferUntil: null } } };
    case 'waiting':
      return { ok: true, transition: { status: 'waiting', patch: { deferUntil: null } } };
    case 'drop':
      return { ok: true, transition: { status: 'dropped', patch: { deferUntil: null } } };
    case 'make-project':
      return { ok: true, transition: { status: 'next', patch: { deferUntil: null } } };
    case 'next-action': {
      const nextAction = (input.nextAction ?? '').trim();
      if (nextAction === '') return { ok: false, error: 'Write the next small step first.' };
      return {
        ok: true,
        transition: {
          status: 'next',
          patch: { nextAction: nextAction.slice(0, NEXT_ACTION_MAX), deferUntil: null },
        },
      };
    }
    case 'schedule': {
      const deferUntil = input.deferUntil;
      if (!(deferUntil instanceof Date) || !Number.isFinite(deferUntil.getTime())) {
        return { ok: false, error: 'Pick a day first.' };
      }
      return { ok: true, transition: { status: 'scheduled', patch: { deferUntil } } };
    }
  }
}

/** Status to return to when the user undoes a triage decision. */
export const UNDO_STATUS: TaskStatus = 'inbox';
