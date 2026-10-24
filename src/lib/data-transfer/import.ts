import { z, type ZodType } from 'zod';
import { getDb } from '@/lib/db/db';
import { SessionSchema, type Session } from '@/lib/schemas/session';
import { ReflectionSchema, type Reflection } from '@/lib/schemas/reflection';
import { StreakSchema, type Streak } from '@/lib/schemas/streak';
import { SettingsSchema, type Settings } from '@/lib/schemas/settings';
import { LLMSettingsSchema, type LLMSettings } from '@/lib/schemas/llm-settings';
import { KataTemplateSchema, type KataTemplate } from '@/lib/schemas/kata-template';
import { ConversationSchema, type Conversation } from '@/lib/schemas/conversation';
import { MessageSchema, type Message } from '@/lib/schemas/message';
import { HabitSchema, HabitLogSchema, type Habit, type HabitLog } from '@/lib/schemas/habit';
import { CheckInSchema, type CheckIn } from '@/lib/schemas/check-in';
import { DomainSchema, type Domain } from '@/lib/schemas/domain';
import { ProjectSchema, type Project } from '@/lib/schemas/project';
import { TaskSchema, type Task } from '@/lib/schemas/task';
import { BlockSchema, type Block } from '@/lib/schemas/block';
import { DayPlanSchema, type DayPlan } from '@/lib/schemas/day-plan';
import { EstimateSchema, type Estimate } from '@/lib/schemas/estimate';
import { ReviewSchema, ReviewDraftSchema, type Review, type ReviewDraft } from '@/lib/schemas/review';
import { rebuildSessionHabitLogs } from '@/lib/habits/session-sync';
import { LeftOutItemSchema, type ExportEnvelope, type ExportEnvelopeV2, type LeftOutItem } from './types';
import { migrateEnvelope } from './migrate';
import { DATE_SPECS, reviveDate, reviveDates } from './dates';
import { refuseIfHostile, refuseIfTooLarge, refuseIfTooManyRows } from './guard';

export type ParseResult =
  | {
      ok: true;
      envelope: ExportEnvelopeV2;
      skipped: number;
      /**
       * Reviews whose stored stats snapshot no longer matched the current
       * schema and were restored without it. Their notes are kept; the numbers
       * are derived data that a later version can recompute.
       */
      snapshotsDropped: number;
      /**
       * Rows kept although a metadata date in them could not be read (the date was dropped, or replaced
       * by another of the row's own times: see `dates.ts`). `repairedBy` counts them per table.
       */
      repaired: number;
      repairedBy: Record<string, number>;
    }
  | { ok: false; error: string };

/**
 * Reviews get their own row mapper because a review carries two kinds of data:
 * the user's own writing, and a derived stats snapshot whose schema will keep
 * growing. A snapshot from an older build must never cost the user their notes,
 * so a row that fails validation only because of `statsSnapshot` is retried
 * without it. Everything else (a non-Monday week key, notes over the limit, bad
 * dates) is still skipped and counted.
 */
function reviveReviews(rows: unknown, backupTime: Date): {
  valid: Review[];
  skipped: number;
  snapshotsDropped: number;
  repaired: number;
} {
  if (!Array.isArray(rows)) return { valid: [], skipped: 0, snapshotsDropped: 0, repaired: 0 };
  const valid: Review[] = [];
  let skipped = 0;
  let snapshotsDropped = 0;
  let repaired = 0;
  for (const row of rows) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      skipped++;
      continue;
    }
    const dated = reviveDates(row as Record<string, unknown>, DATE_SPECS.reviews, backupTime);
    if (!dated) {
      skipped++;
      continue;
    }
    const revived = dated.row;
    const parsed = ReviewSchema.safeParse(revived);
    if (parsed.success) {
      valid.push(parsed.data);
      if (dated.repaired.length > 0) repaired++;
      continue;
    }
    if ('statsSnapshot' in revived) {
      const { statsSnapshot: _dropped, ...withoutSnapshot } = revived;
      const retried = ReviewSchema.safeParse(withoutSnapshot);
      if (retried.success) {
        valid.push(retried.data);
        snapshotsDropped++;
        if (dated.repaired.length > 0) repaired++;
        continue;
      }
    }
    skipped++;
  }
  return { valid, skipped, snapshotsDropped, repaired };
}

function reviveRows<T>(
  rows: unknown,
  schema: ZodType<T>,
  revive: (row: Record<string, unknown>) => Record<string, unknown> | null
): { valid: T[]; skipped: number } {
  if (!Array.isArray(rows)) return { valid: [], skipped: 0 };
  const valid: T[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      skipped++;
      continue;
    }
    const revived = revive(row as Record<string, unknown>);
    if (!revived) {
      skipped++;
      continue;
    }
    const parsed = schema.safeParse(revived);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      skipped++;
    }
  }
  return { valid, skipped };
}

export function parseEnvelope(json: string): ParseResult {
  const tooLarge = refuseIfTooLarge(json.length);
  if (!tooLarge.ok) return tooLarge;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: 'Not a JSON object.' };
    }
    const hostile = refuseIfHostile(parsed);
    if (!hostile.ok) return hostile;
    const tooMany = refuseIfTooManyRows(parsed as Record<string, unknown>);
    if (!tooMany.ok) return tooMany;
    const migrated = migrateEnvelope(parsed as Record<string, unknown>);
    if (!migrated.ok) {
      return { ok: false, error: migrated.error };
    }
    const p = migrated.raw;
    if (!Array.isArray(p.sessions)) {
      return { ok: false, error: 'Missing or invalid sessions array.' };
    }
    for (const field of ['reflections', 'kataTemplates', 'conversations', 'messages', 'habits', 'habitLogs', 'checkIns', 'domains', 'projects', 'tasks', 'blocks', 'dayPlans', 'estimates', 'reviews', 'reviewDrafts'] as const) {
      if (p[field] !== undefined && !Array.isArray(p[field])) {
        return { ok: false, error: `Invalid ${field}: expected an array.` };
      }
    }

    let skipped = 0;

    // Rows whose metadata dates could not be read, by table: kept, with the date dropped or replaced.
    const repairedBy: Record<string, number> = {};
    const backupTime = reviveDate(p.exportedAt) ?? new Date();
    const dated = (table: keyof typeof DATE_SPECS) => (row: Record<string, unknown>) => {
      const revived = reviveDates(row, DATE_SPECS[table], backupTime);
      if (!revived) return null;
      if (revived.repaired.length > 0) repairedBy[table] = (repairedBy[table] ?? 0) + 1;
      return revived.row;
    };
    const rowsOf = (field: string): unknown => (p[field] === undefined ? [] : p[field]);

    const sessionsResult = dedupeById(reviveRows(p.sessions, SessionSchema, dated('sessions')));
    skipped += sessionsResult.skipped;

    const reflectionsResult = dedupeById(reviveRows(p.reflections ?? [], ReflectionSchema, dated('reflections')));
    skipped += reflectionsResult.skipped;

    const kataResult = dedupeById(reviveRows(rowsOf('kataTemplates'), KataTemplateSchema, dated('kataTemplates')));
    skipped += kataResult.skipped;

    const conversationsResult = dedupeById(reviveRows(rowsOf('conversations'), ConversationSchema, dated('conversations')));
    skipped += conversationsResult.skipped;

    const messagesResult = dedupeById(reviveRows(rowsOf('messages'), MessageSchema, dated('messages')));
    skipped += messagesResult.skipped;

    const habitsResult = dedupeById(reviveRows(rowsOf('habits'), HabitSchema, dated('habits')));
    skipped += habitsResult.skipped;

    const habitLogsResult = dedupeById(reviveRows(rowsOf('habitLogs'), HabitLogSchema, dated('habitLogs')));
    skipped += habitLogsResult.skipped;

    const checkInsResult = dedupeBy(reviveRows(rowsOf('checkIns'), CheckInSchema, dated('checkIns')), (c) => c.date);
    skipped += checkInsResult.skipped;

    const domainsResult = dedupeById(reviveRows(rowsOf('domains'), DomainSchema, dated('domains')));
    skipped += domainsResult.skipped;

    const projectsResult = dedupeById(reviveRows(rowsOf('projects'), ProjectSchema, dated('projects')));
    skipped += projectsResult.skipped;

    const tasksResult = dedupeById(reviveRows(rowsOf('tasks'), TaskSchema, dated('tasks')));
    skipped += tasksResult.skipped;

    const blocksResult = dedupeById(reviveRows(rowsOf('blocks'), BlockSchema, dated('blocks')));
    skipped += blocksResult.skipped;

    const dayPlansResult = dedupeBy(reviveRows(rowsOf('dayPlans'), DayPlanSchema, dated('dayPlans')), (d) => d.date);
    skipped += dayPlansResult.skipped;

    const estimatesResult = dedupeById(reviveRows(rowsOf('estimates'), EstimateSchema, dated('estimates')));
    skipped += estimatesResult.skipped;

    const reviewRows = reviveReviews(rowsOf('reviews'), backupTime);
    const snapshotsDropped = reviewRows.snapshotsDropped;
    if (reviewRows.repaired > 0) repairedBy.reviews = reviewRows.repaired;
    const reviewsResult = dedupeBy(reviewRows, (review) => review.weekOf);
    skipped += reviewsResult.skipped;

    const reviewDraftsResult = dedupeBy(reviveRows(rowsOf('reviewDrafts'), ReviewDraftSchema, dated('reviewDrafts')), (draft) => draft.weekOf);
    skipped += reviewDraftsResult.skipped;

    const streakRevived = reviveStreak(p.streak, backupTime);
    const settingsRevived = reviveSettings(p.settings, backupTime);
    const llmRevived = reviveLLMSettings(p.llmSettings, backupTime);
    const streak = streakRevived.value;
    const settings = settingsRevived.value;
    const llmSettings = llmRevived.value;
    for (const [key, revived] of [['streak', streakRevived], ['settings', settingsRevived], ['llmSettings', llmRevived]] as const) {
      if (revived.repaired) repairedBy[key] = 1;
    }
    // A single-row record that is in the file but unusable is skipped (and counted), not silently lost.
    for (const [carried, revived] of [[p.streak, streak], [p.settings, settings], [p.llmSettings, llmSettings]] as const) {
      if (carried != null && revived === null) skipped++;
    }
    const leftOut = reviveLeftOut(p.leftOut);

    const envelope: ExportEnvelopeV2 = {
      version: 2,
      exportedAt: typeof p.exportedAt === 'string' ? p.exportedAt : new Date().toISOString(),
      sessions: sessionsResult.unique as Session[],
      reflections: reflectionsResult.unique as Reflection[],
      streak,
      settings,
      llmSettings,
      ...(p.kataTemplates !== undefined ? { kataTemplates: kataResult.unique as KataTemplate[] } : {}),
      ...(p.conversations !== undefined
        ? {
            conversations: conversationsResult.unique as Conversation[],
            messages: messagesResult.unique as Message[],
          }
        : {}),
      ...(p.habits !== undefined
        ? {
            habits: habitsResult.unique as Habit[],
            habitLogs: habitLogsResult.unique as HabitLog[],
          }
        : {}),
      ...(p.checkIns !== undefined ? { checkIns: checkInsResult.unique as CheckIn[] } : {}),
      ...(p.domains !== undefined ? { domains: domainsResult.unique as Domain[] } : {}),
      ...(p.projects !== undefined ? { projects: projectsResult.unique as Project[] } : {}),
      ...(p.tasks !== undefined ? { tasks: tasksResult.unique as Task[] } : {}),
      ...(p.blocks !== undefined ? { blocks: blocksResult.unique as Block[] } : {}),
      ...(p.dayPlans !== undefined ? { dayPlans: dayPlansResult.unique as DayPlan[] } : {}),
      ...(p.estimates !== undefined ? { estimates: estimatesResult.unique as Estimate[] } : {}),
      ...(p.reviews !== undefined ? { reviews: reviewsResult.unique as Review[] } : {}),
      ...(p.reviewDrafts !== undefined ? { reviewDrafts: reviewDraftsResult.unique as ReviewDraft[] } : {}),
      ...(leftOut ? { leftOut } : {}),
    };
    const repaired = Object.values(repairedBy).reduce((n, c) => n + c, 0);
    return { ok: true, envelope, skipped, snapshotsDropped, repaired, repairedBy };
  } catch (e) {
    // Never echo the engine's message: for malformed JSON it quotes the start of the file.
    return { ok: false, error: e instanceof SyntaxError ? "This file isn't valid JSON." : 'This file could not be read.' };
  }
}

function dedupeById<T extends { id: string }>(
  result: { valid: T[]; skipped: number }
): { unique: T[]; skipped: number } {
  return dedupeBy(result, (row) => row.id);
}

function dedupeBy<T>(
  result: { valid: T[]; skipped: number },
  keyOf: (row: T) => string
): { unique: T[]; skipped: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  let skipped = result.skipped;
  for (const row of result.valid) {
    const key = keyOf(row);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    unique.push(row);
  }
  return { unique, skipped };
}

function reviveLeftOut(value: unknown): LeftOutItem[] | undefined {
  const parsed = z.array(LeftOutItemSchema).max(50).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

interface Revived<T> {
  value: T | null;
  repaired: boolean;
}

function reviveStreak(value: unknown, backupTime: Date): Revived<Streak> {
  if (!value || typeof value !== 'object') return { value: null, repaired: false };
  const dated = reviveDates(value as Record<string, unknown>, DATE_SPECS.streak, backupTime);
  if (!dated || dated.row.updatedAt === undefined) return { value: null, repaired: false };
  const parsed = StreakSchema.safeParse(dated.row);
  return parsed.success ? { value: parsed.data, repaired: dated.repaired.length > 0 } : { value: null, repaired: false };
}

function reviveSettings(value: unknown, backupTime: Date): Revived<Settings> {
  if (!value || typeof value !== 'object') return { value: null, repaired: false };
  const dated = reviveDates(value as Record<string, unknown>, DATE_SPECS.settings, backupTime);
  if (!dated) return { value: null, repaired: false };
  // A settings row from before the stamps existed is given today's.
  const row = { ...dated.row, createdAt: dated.row.createdAt ?? new Date(), updatedAt: dated.row.updatedAt ?? new Date() };
  const parsed = SettingsSchema.safeParse(row);
  return parsed.success ? { value: parsed.data as Settings, repaired: dated.repaired.length > 0 } : { value: null, repaired: false };
}

function reviveLLMSettings(value: unknown, backupTime: Date): Revived<LLMSettings> {
  if (!value || typeof value !== 'object') return { value: null, repaired: false };
  const dated = reviveDates(value as Record<string, unknown>, DATE_SPECS.llmSettings, backupTime);
  if (!dated || dated.row.totalTokensResetAt === undefined || dated.row.updatedAt === undefined) return { value: null, repaired: false };
  const parsed = LLMSettingsSchema.safeParse(dated.row);
  return parsed.success ? { value: parsed.data, repaired: dated.repaired.length > 0 } : { value: null, repaired: false };
}

/**
 * DANGEROUS: replaces the data in the backup. Sessions and reflections are always replaced; every
 * other collection is replaced only when the backup carries it (legacy files leave local data alone).
 *
 * SECRETS stay on the device (docs/waves/wave-18.md). A plain backup never holds them, so a restore
 * must not take them away either: Google sign-in tokens are kept, an API key is kept for each provider
 * the backup names without one, and the private calendar-feed URL is kept when the backup has none.
 * The "Google Calendar connected" mark is cleared when this device has no sign-in to go with it.
 *
 * A singleton the backup does not carry (or that failed validation on the way in) is left as it is
 * on the device, never wiped.
 */
export async function replaceAll(envelope: ExportEnvelope): Promise<void> {
  const db = getDb();

  // Wipe and restore atomically: if any restore step throws (e.g. a
  // constraint violation), the transaction rolls back and the previous
  // data survives. The device's own secrets are read INSIDE the transaction,
  // so what is kept is what is there at the moment of the write.
  await db.transaction(
    'rw',
    [
      db.sessions,
      db.reflections,
      db.streak,
      db.settings,
      db.llmSettings,
      db.pendingCalendarOps,
      db.tokens,
      db.kataTemplates,
      db.conversations,
      db.messages,
      db.habits,
      db.habitLogs,
      db.checkIns,
      db.domains,
      db.projects,
      db.tasks,
      db.blocks,
      db.dayPlans,
      db.estimates,
      db.reviews,
      db.reviewDrafts,
    ],
    async () => {
      const [existingLLM, existingSettings, googleToken] = await Promise.all([
        db.llmSettings.get('singleton'),
        db.settings.get('singleton'),
        db.tokens.get('google'),
      ]);
      const existingKeys = new Map<string, string>();
      for (const [name, cfg] of Object.entries(existingLLM?.providers ?? {})) {
        if (cfg.apiKey) existingKeys.set(name, cfg.apiKey);
      }

      // Calendar updates waiting to be sent belong to the sessions being replaced. (The Google
      // sign-in in `tokens` is NOT cleared: it is this device's, not the backup's.)
      await Promise.all([db.sessions.clear(), db.reflections.clear(), db.pendingCalendarOps.clear()]);

      if (envelope.sessions.length > 0) {
        await db.sessions.bulkAdd(envelope.sessions);
      }

      if (envelope.reflections.length > 0) {
        await db.reflections.bulkAdd(envelope.reflections);
      }

      if (envelope.streak) {
        await db.streak.put(envelope.streak);
      }

      if (envelope.settings) {
        const settings: Settings = { ...envelope.settings };
        // The private calendar link stays on this device when the backup (rightly) has none.
        if (!settings.icsSubscriptionUrl && existingSettings?.icsSubscriptionUrl) {
          settings.icsSubscriptionUrl = existingSettings.icsSubscriptionUrl;
        }
        // "Connected" is only true where the sign-in is.
        if (settings.googleCalendarConnectedAt && !googleToken) settings.googleCalendarConnectedAt = null;
        await db.settings.put(settings);
      }

      // Preserve existing API keys where envelope has empty.
      if (envelope.llmSettings) {
        const providersWithKeys = Object.fromEntries(
          Object.entries(envelope.llmSettings.providers).map(([name, cfg]) => [
            name,
            { ...cfg, apiKey: cfg.apiKey || existingKeys.get(name) || '' },
          ])
        );
        await db.llmSettings.put({
          ...envelope.llmSettings,
          providers: providersWithKeys,
        } as LLMSettings);
      }

      // Kata templates (only for envelopes that carry them).
      if (envelope.kataTemplates !== undefined) {
        await db.kataTemplates.clear();
        if (envelope.kataTemplates.length > 0) {
          await db.kataTemplates.bulkAdd(envelope.kataTemplates);
        }
      }

      // Coach threads (only for envelopes that carry them).
      if (envelope.conversations !== undefined) {
        await db.conversations.clear();
        await db.messages.clear();
        if (envelope.conversations.length > 0) {
          await db.conversations.bulkAdd(envelope.conversations);
        }
        const messages = envelope.messages ?? [];
        if (messages.length > 0) {
          await db.messages.bulkAdd(messages);
        }
      }

      // Habits (only for envelopes that carry them).
      if (envelope.habits !== undefined) {
        await db.habits.clear();
        await db.habitLogs.clear();
        if (envelope.habits.length > 0) {
          await db.habits.bulkAdd(envelope.habits);
        }
        const habitLogs = envelope.habitLogs ?? [];
        if (habitLogs.length > 0) {
          await db.habitLogs.bulkAdd(habitLogs);
        }
      }

      // Check-ins (v2+ envelopes; absent in migrated v1 files).
      if (envelope.checkIns !== undefined) {
        await db.checkIns.clear();
        if (envelope.checkIns.length > 0) {
          await db.checkIns.bulkAdd(envelope.checkIns);
        }
      }

      // Wave 1 tables (only for envelopes that carry them; domains fall
      // back to the default seed when absent).
      if (envelope.domains !== undefined) {
        await db.domains.clear();
        if (envelope.domains.length > 0) {
          await db.domains.bulkAdd(envelope.domains);
        }
      }
      if (envelope.projects !== undefined) {
        await db.projects.clear();
        if (envelope.projects.length > 0) {
          await db.projects.bulkAdd(envelope.projects);
        }
      }
      if (envelope.tasks !== undefined) {
        await db.tasks.clear();
        if (envelope.tasks.length > 0) {
          await db.tasks.bulkAdd(envelope.tasks);
        }
      }
      if (envelope.blocks !== undefined) {
        await db.blocks.clear();
        if (envelope.blocks.length > 0) {
          await db.blocks.bulkAdd(envelope.blocks);
        }
      }
      if (envelope.dayPlans !== undefined) {
        await db.dayPlans.clear();
        if (envelope.dayPlans.length > 0) {
          await db.dayPlans.bulkAdd(envelope.dayPlans);
        }
      }
      if (envelope.estimates !== undefined) {
        await db.estimates.clear();
        if (envelope.estimates.length > 0) {
          await db.estimates.bulkAdd(envelope.estimates);
        }
      }

      if (envelope.reviews !== undefined) {
        await db.reviews.clear();
        if (envelope.reviews.length > 0) await db.reviews.bulkAdd(envelope.reviews);
      }

      if (envelope.reviewDrafts !== undefined) {
        await db.reviewDrafts.clear();
        if (envelope.reviewDrafts.length > 0) await db.reviewDrafts.bulkAdd(envelope.reviewDrafts);
      }

      // Session-derived habit logs: a backup that carries habit logs already holds the logs the app
      // made, with their ids and times, so they are restored exactly as they were. Only a backup
      // WITHOUT them (a legacy file) has them derived again from the sessions and habits that are now
      // here. Inside the same transaction: a failure here undoes the whole restore, not half of it.
      if (envelope.habitLogs === undefined) await rebuildSessionHabitLogs();
    }
  );
}

// Type re-exports for compatibility with imports in callers
export type { Session, Reflection, Streak, Settings, LLMSettings, KataTemplate, Conversation, Message, Habit, HabitLog, CheckIn, Domain, Project, Task, Block, DayPlan, Estimate, Review, ReviewDraft };
