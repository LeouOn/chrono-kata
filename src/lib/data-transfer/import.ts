import { type ZodType } from 'zod';
import { getDb } from '@/lib/db/db';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { SessionSchema, type Session } from '@/lib/schemas/session';
import { ReflectionSchema, type Reflection } from '@/lib/schemas/reflection';
import { StreakSchema, type Streak } from '@/lib/schemas/streak';
import { SettingsSchema, type Settings } from '@/lib/schemas/settings';
import { LLMSettingsSchema, type LLMSettings } from '@/lib/schemas/llm-settings';
import { KataTemplateSchema, type KataTemplate } from '@/lib/schemas/kata-template';
import { ConversationSchema, type Conversation } from '@/lib/schemas/conversation';
import { MessageSchema, type Message } from '@/lib/schemas/message';
import { HabitSchema, HabitLogSchema, type Habit, type HabitLog } from '@/lib/schemas/habit';
import { rebuildSessionHabitLogs } from '@/lib/habits/session-sync';
import type { ExportEnvelope } from './types';

export type ParseResult =
  | { ok: true; envelope: ExportEnvelope; skipped: number }
  | { ok: false; error: string };

function reviveDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function reviveNullableDate(value: unknown): Date | null | undefined {
  if (value == null) return value === null ? null : undefined;
  return reviveDate(value);
}

function hasValidDates(row: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((f) => {
    const v = row[f];
    if (v == null) return true;
    return reviveDate(v) != null;
  });
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
    if (typeof row !== 'object' || row === null) {
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

const SESSION_DATE_FIELDS = ['startedAt', 'endedAt', 'createdAt', 'updatedAt'];
const REFLECTION_DATE_FIELDS = ['periodStart', 'periodEnd', 'createdAt'];
const KATA_DATE_FIELDS = ['createdAt', 'updatedAt'];
const CONVERSATION_DATE_FIELDS = ['createdAt', 'updatedAt'];
const MESSAGE_DATE_FIELDS = ['createdAt', 'editedAt'];
const HABIT_DATE_FIELDS = ['createdAt', 'updatedAt'];
const HABIT_LOG_DATE_FIELDS = ['createdAt'];

export function parseEnvelope(json: string): ParseResult {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, error: 'Not a JSON object.' };
    }
    const p = parsed as Record<string, unknown>;
    if (p.version !== 1) {
      return { ok: false, error: `Unsupported version: ${String(p.version ?? 'missing')}. Only version 1 supported.` };
    }
    if (!Array.isArray(p.sessions)) {
      return { ok: false, error: 'Missing or invalid sessions array.' };
    }
    for (const field of ['reflections', 'kataTemplates', 'conversations', 'messages', 'habits', 'habitLogs'] as const) {
      if (p[field] !== undefined && !Array.isArray(p[field])) {
        return { ok: false, error: `Invalid ${field}: expected an array.` };
      }
    }

    let skipped = 0;

    const sessionsResult = dedupeById(
      reviveRows(
        p.sessions,
        SessionSchema,
        (row) =>
          hasValidDates(row, SESSION_DATE_FIELDS)
            ? {
                ...row,
                startedAt: reviveDate(row.startedAt),
                endedAt: reviveNullableDate(row.endedAt) ?? null,
                createdAt: reviveDate(row.createdAt),
                updatedAt: reviveDate(row.updatedAt),
              }
            : null
      )
    );
    skipped += sessionsResult.skipped;

    const reflectionsResult = dedupeById(
      reviveRows(
        p.reflections ?? [],
        ReflectionSchema,
        (row) =>
          hasValidDates(row, REFLECTION_DATE_FIELDS)
            ? {
                ...row,
                periodStart: reviveDate(row.periodStart),
                periodEnd: reviveDate(row.periodEnd),
                createdAt: reviveDate(row.createdAt),
              }
            : null
      )
    );
    skipped += reflectionsResult.skipped;

    const kataResult = dedupeById(
      reviveRows(
        p.kataTemplates === undefined ? [] : p.kataTemplates,
        KataTemplateSchema,
        (row) =>
          hasValidDates(row, KATA_DATE_FIELDS)
            ? {
                ...row,
                createdAt: reviveDate(row.createdAt),
                updatedAt: reviveDate(row.updatedAt),
              }
            : null
      )
    );
    skipped += kataResult.skipped;

    const conversationsResult = dedupeById(
      reviveRows(
        p.conversations === undefined ? [] : p.conversations,
        ConversationSchema,
        (row) =>
          hasValidDates(row, CONVERSATION_DATE_FIELDS)
            ? {
                ...row,
                createdAt: reviveDate(row.createdAt),
                updatedAt: reviveDate(row.updatedAt),
              }
            : null
      )
    );
    skipped += conversationsResult.skipped;

    const messagesResult = dedupeById(
      reviveRows(
        p.messages === undefined ? [] : p.messages,
        MessageSchema,
        (row) => {
          if (!hasValidDates(row, MESSAGE_DATE_FIELDS)) return null;
          const revived: Record<string, unknown> = {
            ...row,
            createdAt: reviveDate(row.createdAt),
          };
          if (row.editedAt !== undefined) revived.editedAt = reviveDate(row.editedAt);
          return revived;
        }
      )
    );
    skipped += messagesResult.skipped;

    const habitsResult = dedupeById(
      reviveRows(
        p.habits === undefined ? [] : p.habits,
        HabitSchema,
        (row) =>
          hasValidDates(row, HABIT_DATE_FIELDS)
            ? {
                ...row,
                archivedAt: reviveNullableDate(row.archivedAt) ?? null,
                createdAt: reviveDate(row.createdAt),
                updatedAt: reviveDate(row.updatedAt),
              }
            : null
      )
    );
    skipped += habitsResult.skipped;

    const habitLogsResult = dedupeById(
      reviveRows(
        p.habitLogs === undefined ? [] : p.habitLogs,
        HabitLogSchema,
        (row) =>
          hasValidDates(row, HABIT_LOG_DATE_FIELDS)
            ? { ...row, createdAt: reviveDate(row.createdAt) }
            : null
      )
    );
    skipped += habitLogsResult.skipped;

    const streak = reviveStreak(p.streak);
    const settings = reviveSettings(p.settings);
    const llmSettings = reviveLLMSettings(p.llmSettings);

    const envelope: ExportEnvelope = {
      version: 1,
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
    };
    return { ok: true, envelope, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function dedupeById<T extends { id: string }>(
  result: { valid: T[]; skipped: number }
): { unique: T[]; skipped: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  let skipped = result.skipped;
  for (const row of result.valid) {
    if (seen.has(row.id)) {
      skipped++;
      continue;
    }
    seen.add(row.id);
    unique.push(row);
  }
  return { unique, skipped };
}

function reviveStreak(value: unknown): Streak | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const updatedAt = reviveDate(row.updatedAt);
  if (!updatedAt) return null;
  const parsed = StreakSchema.safeParse({ ...row, updatedAt });
  return parsed.success ? parsed.data : null;
}

function reviveSettings(value: unknown): Settings | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const createdAt = reviveDate(row.createdAt) ?? new Date();
  const updatedAt = reviveDate(row.updatedAt) ?? new Date();
  const connectedAt =
    row.googleCalendarConnectedAt == null
      ? null
      : reviveDate(row.googleCalendarConnectedAt);
  if (row.googleCalendarConnectedAt != null && connectedAt == null) return null;
  const freezeUsedAt =
    row.lastStreakFreezeUsedAt == null
      ? null
      : reviveDate(row.lastStreakFreezeUsedAt);
  if (row.lastStreakFreezeUsedAt != null && freezeUsedAt == null) return null;
  const parsed = SettingsSchema.safeParse({
    ...row,
    createdAt,
    updatedAt,
    googleCalendarConnectedAt: connectedAt,
    lastStreakFreezeUsedAt: freezeUsedAt,
  });
  return parsed.success ? (parsed.data as Settings) : null;
}

function reviveLLMSettings(value: unknown): LLMSettings | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const totalTokensResetAt = reviveDate(row.totalTokensResetAt);
  const updatedAt = reviveDate(row.updatedAt);
  if (!totalTokensResetAt || !updatedAt) return null;
  const parsed = LLMSettingsSchema.safeParse({ ...row, totalTokensResetAt, updatedAt });
  return parsed.success ? parsed.data : null;
}

/**
 * DANGEROUS: wipes ALL data and restores from envelope. Existing API keys
 * are preserved when imported entries have empty apiKey fields (since export
 * strips keys for safety). Legacy files without kataTemplates/conversations
 * leave those tables untouched.
 */
export async function replaceAll(envelope: ExportEnvelope): Promise<void> {
  const db = getDb();

  // Capture existing API keys before wipe (so we can restore them after).
  const existingLLM = await llmSettingsRepo.get();
  const existingKeys = new Map<string, string>();
  for (const [name, cfg] of Object.entries(existingLLM.providers)) {
    if (cfg.apiKey) existingKeys.set(name, cfg.apiKey);
  }

  // Wipe and restore atomically: if any restore step throws (e.g. a
  // constraint violation), the transaction rolls back and the previous
  // data survives.
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
    ],
    async () => {
      await Promise.all([
        db.sessions.clear(),
        db.reflections.clear(),
        db.streak.clear(),
        db.settings.clear(),
        db.llmSettings.clear(),
        db.pendingCalendarOps.clear(),
        db.tokens.clear(),
      ]);

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
        await db.settings.put(envelope.settings);
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
    }
  );

  // Reconcile session-derived habit logs with the final sessions × habits
  // (covers replaced sessions, skipped invalid rows, and legacy files).
  await rebuildSessionHabitLogs();
}

// Type re-exports for compatibility with imports in callers
export type { Session, Reflection, Streak, Settings, LLMSettings, KataTemplate, Conversation, Message, Habit, HabitLog };
