/**
 * The revive offer (roadmap Wave 10, part 3): when a project has gone quiet, offer
 * ONE small way back in - a ten-minute session whose only goal is to touch the
 * project and leave a note - and then leave the user alone about it.
 *
 * This is the "nudge without guilt" half of the wave, so the rules are about
 * restraint as much as about what to show:
 *
 * - Never more than ONE offer on a given local day, however many projects are
 *   quiet. Answering it ("Not now") ends the day's offers.
 * - The same project is not offered again for `REVIVE_SNOOZE_DAYS` local days
 *   after it was put aside.
 * - Which project: the first of `detectStalls`' order, the one that went quiet
 *   most recently (the easiest to pick back up). With a fixed set of quiet
 *   projects that means the few most recent ones take turns and the longest-quiet
 *   ones rest - on purpose: an unpicked project rests on the list without guilt,
 *   and the weekly review is where it is let go.
 * - Nothing here changes a project. Starting the session is the only thing that
 *   touches it, and that is the user's act.
 *
 * Everything is pure; where the state is kept is `revive-store.ts`.
 */

import { z } from 'zod';
import { addDays } from '@/lib/pacing/days';
import type { Project } from '@/lib/schemas/project';
import { MINIMUM_SESSION_MIN, type ProjectStall } from './stall';

/** Local days a put-aside project is left alone for. */
export const REVIVE_SNOOZE_DAYS = 3;

/** The most put-aside projects remembered; older ones are forgotten first. */
const MAX_REMEMBERED = 50;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DayKeySchema = z.string().regex(DAY_KEY);

/** What is kept between visits: a quiet day, and when each project may be offered again. */
export const ReviveStateSchema = z.object({
  /** The local day on which the user last answered an offer: no more offers that day. */
  quietDay: DayKeySchema.nullable(),
  /** Project id -> the first local day it may be offered again. */
  snoozedUntil: z.record(z.string().min(1).max(64), DayKeySchema),
});
export type ReviveState = z.infer<typeof ReviveStateSchema>;

export const EMPTY_REVIVE_STATE: ReviveState = { quietDay: null, snoozedUntil: {} };

/**
 * Read stored state without trusting it. Anything that is not exactly the shape
 * above - a hand-edited value, an older build's - becomes "nothing remembered",
 * which means a card may show once more, never that the app breaks.
 */
export function parseReviveState(raw: unknown): ReviveState {
  const parsed = ReviveStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_REVIVE_STATE;
}

/** What starting a minimum session opens: the launcher's link, as a plain object. */
export interface MinimumSessionLink {
  readonly projectId: string;
  readonly label: string;
  readonly estimateMin: number;
}

/**
 * The ten-minute session for a project. It is an ordinary project-linked session
 * through the existing launcher and timer (no second timer); the project's pick-up
 * note is required to save it, which is the point: touch it and leave a note.
 */
export function minimumSessionLink(project: Pick<Project, 'id' | 'title'>): MinimumSessionLink {
  return {
    projectId: project.id,
    label: project.title.slice(0, 50),
    estimateMin: MINIMUM_SESSION_MIN,
  };
}

/**
 * The one project to offer today, or null.
 *
 * `stalls` is `detectStalls`' list (most recently quiet first). `today` is the
 * local day key.
 */
export function selectRevive(
  stalls: readonly ProjectStall[],
  state: ReviveState,
  today: string,
): ProjectStall | null {
  if (state.quietDay === today) return null;
  return (
    stalls.find((stall) => {
      const until = state.snoozedUntil[stall.project.id];
      return until === undefined || today >= until;
    }) ?? null
  );
}

/**
 * The user put an offer aside ("Not now"): leave that project alone for
 * `REVIVE_SNOOZE_DAYS` days and make no other offer today. Expired snoozes are
 * dropped and the list stays bounded.
 */
export function dismissRevive(state: ReviveState, projectId: string, today: string): ReviveState {
  const live = Object.entries(state.snoozedUntil).filter(([id, until]) => id !== projectId && until > today);
  const bounded = live.sort(([, a], [, b]) => (a < b ? 1 : a > b ? -1 : 0)).slice(0, MAX_REMEMBERED - 1);
  return {
    quietDay: today,
    snoozedUntil: { ...Object.fromEntries(bounded), [projectId]: addDays(today, REVIVE_SNOOZE_DAYS) },
  };
}
