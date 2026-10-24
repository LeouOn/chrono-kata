import { applyTransition } from '@/lib/tasks/transitions';
import { DayPlanSchema, type DayPlan } from '@/lib/schemas/day-plan';
import { getDb } from './db';
import { planShutdown, type PlanShutdownInput } from '@/lib/journal/shutdown';
import { normaliseJournalText, FIRST_ACTION_MAX, JOURNAL_TEXT_MAX, SHUTDOWN_NOTE_MAX } from '@/lib/journal/template';
import { isDayKey } from '@/lib/pacing/days';

/**
 * The journal's write path (roadmap Wave 12).
 *
 * Every method returns the stored `DayPlan` (never `undefined`), validates the
 * value it is about to persist, and keeps a multi-row change in ONE transaction:
 * a shutdown that fails halfway leaves the day and its tasks exactly as they
 * were.
 */
export interface JournalRepository {
  /** The day's plan, or null. */
  findByDate(date: string): Promise<DayPlan | null>;
  /** Save the journal text for a day (creates a bare plan when the day has none). */
  saveJournal(date: string, journal: string, now?: Date): Promise<DayPlan>;
  /**
   * Apply an evening shutdown: task outcomes and the day's plan fields in one
   * transaction. Idempotent: the second identical call writes nothing.
   */
  applyShutdown(input: Omit<PlanShutdownInput, 'plan' | 'tasks'>): Promise<DayPlan>;
}

/**
 * A day key must be a real local calendar date: "2026-06-31" is well-formed and
 * not a day, and nothing in the app can read it back.
 */
function assertDayKey(date: string): string {
  if (!isDayKey(date)) throw new Error(`Invalid day key "${date}"; expected YYYY-MM-DD`);
  return date;
}

export class DexieJournalRepository implements JournalRepository {
  async findByDate(date: string): Promise<DayPlan | null> {
    return (await getDb().dayPlans.get(assertDayKey(date))) ?? null;
  }

  async saveJournal(date: string, journal: string, now: Date = new Date()): Promise<DayPlan> {
    const parsed = normaliseJournalText(journal, JOURNAL_TEXT_MAX);
    if (!parsed.ok) throw new Error(parsed.error);
    const db = getDb();
    return db.transaction('rw', db.dayPlans, async () => {
      const existing = await db.dayPlans.get(assertDayKey(date));
      const plan = DayPlanSchema.parse({
        ...(existing ?? { date, picks: [], capacityMin: 0 }),
        date,
        journal: parsed.value === '' ? null : parsed.value,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      await db.dayPlans.put(plan);
      return plan;
    });
  }

  async applyShutdown(input: Omit<PlanShutdownInput, 'plan' | 'tasks'>): Promise<DayPlan> {
    const date = assertDayKey(input.date);
    // Validate the journal-side values before opening the transaction, on the
    // normalised value the schema will store.
    const note =
      input.shutdownNote === undefined
        ? undefined
        : normaliseJournalText(input.shutdownNote ?? '', SHUTDOWN_NOTE_MAX);
    if (note && !note.ok) throw new Error(note.error);
    const firstAction =
      input.firstActionTomorrow === undefined
        ? undefined
        : normaliseJournalText(input.firstActionTomorrow ?? '', FIRST_ACTION_MAX);
    if (firstAction && !firstAction.ok) throw new Error(firstAction.error);

    const db = getDb();
    return db.transaction('rw', db.dayPlans, db.tasks, async () => {
      const existing = (await db.dayPlans.get(date)) ?? null;
      // Load the tasks this call decides AND every task the stored record
      // already names. The merge in planShutdown drops an id whose task row is
      // gone, so handing it only this call's tasks would make every previously
      // recorded id look deleted and erase the record.
      const taskIds = [
        ...new Set([
          ...input.decisions.map((decision) => decision.taskId),
          ...(existing?.picksDone ?? []),
          ...(existing?.picksBack ?? []),
          ...(existing?.picks ?? []),
        ]),
      ];
      const tasks = (await db.tasks.bulkGet(taskIds)).filter(
        (task): task is NonNullable<typeof task> => task !== undefined,
      );
      const planned = planShutdown({ ...input, date, plan: existing, tasks });
      if (!planned.ok) throw new Error(planned.error);

      if (!planned.value.changed) {
        // A repeated shutdown with the same decisions must not rewrite the row:
        // the caller gets the stored plan back and the timestamp stays put.
        return existing ?? planned.value.plan;
      }

      for (const patch of planned.value.taskPatches) {
        const task = await db.tasks.get(patch.id);
        if (!task) continue;
        // One transition per task, through the same rules the rest of the app
        // uses (doneAt is managed there).
        const transitioned = applyTransition(
          patch.clearDeferUntil ? { ...task, deferUntil: null } : task,
          patch.status,
          input.now,
        );
        await db.tasks.put(transitioned);
      }
      await db.dayPlans.put(planned.value.plan);
      return planned.value.plan;
    });
  }
}

export const journalRepo: JournalRepository = new DexieJournalRepository();
