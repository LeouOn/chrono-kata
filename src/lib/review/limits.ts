/**
 * Shared bounds for the review wizard (roadmap Wave 11).
 *
 * These live in one module so the input that renders a form and the schema that
 * stores the value cannot disagree: a control's `maxLength` and the Zod `.max()`
 * are both read from here.
 */

/** The user's own words in a review. Matches `ReviewSchema.notes`. */
export const NOTES_MAX = 10_000;

/** One next action. Matches `TaskSchema.nextAction`. */
export const NEXT_ACTION_MAX = 500;

/** A project breadcrumb. Matches `ProjectSchema.breadcrumb`. */
export const BREADCRUMB_MAX = 500;

/** One week of minutes: an intention cannot ask for more time than exists. */
export const INTENTION_MAX_MINUTES = 7 * 24 * 60;

/** `ProjectSchema.cadencePerWeek` bounds. */
export const CADENCE_MAX = 7;
