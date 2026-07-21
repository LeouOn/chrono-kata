import { getDb } from '@/lib/db/db';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import type { ExportEnvelope } from './types';
import type { Session } from '@/lib/schemas/session';
import type { Reflection } from '@/lib/schemas/reflection';
import type { Streak } from '@/lib/schemas/streak';
import type { Settings } from '@/lib/schemas/settings';
import type { LLMSettings } from '@/lib/schemas/llm-settings';
import type { PendingCalendarOp } from '@/lib/schemas/pending-calendar-op';
import type { Token } from '@/lib/schemas/token';

export type ParseResult =
  | { ok: true; envelope: ExportEnvelope }
  | { ok: false; error: string };

export function parseEnvelope(json: string): ParseResult {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, error: 'Not a JSON object.' };
    }
    const p = parsed as Partial<ExportEnvelope>;
    if (p.version !== 1) {
      return { ok: false, error: `Unsupported version: ${p.version ?? 'missing'}. Only version 1 supported.` };
    }
    if (!Array.isArray(p.sessions)) {
      return { ok: false, error: 'Missing or invalid sessions array.' };
    }
    // Convert ISO date strings back to Date objects.
    const envelope: ExportEnvelope = {
      version: 1,
      exportedAt: p.exportedAt ?? new Date().toISOString(),
      sessions: p.sessions.map((s) => ({
        ...s,
        startedAt: new Date(s.startedAt),
        endedAt: s.endedAt ? new Date(s.endedAt) : null,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
      })) as Session[],
      reflections: (p.reflections ?? []).map((r) => ({
        ...r,
        periodStart: new Date(r.periodStart),
        periodEnd: new Date(r.periodEnd),
        createdAt: new Date(r.createdAt),
      })) as Reflection[],
      streak: p.streak
        ? {
            ...p.streak,
            updatedAt: new Date(p.streak.updatedAt),
          }
        : null,
      settings: p.settings
        ? {
            ...p.settings,
            createdAt: new Date(p.settings.createdAt),
            updatedAt: new Date(p.settings.updatedAt),
            googleCalendarConnectedAt: p.settings.googleCalendarConnectedAt
              ? new Date(p.settings.googleCalendarConnectedAt)
              : null,
          }
        : null,
      llmSettings: p.llmSettings
        ? {
            ...p.llmSettings,
            totalTokensResetAt: new Date(p.llmSettings.totalTokensResetAt),
            updatedAt: new Date(p.llmSettings.updatedAt),
          }
        : null,
    };
    return { ok: true, envelope };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * DANGEROUS: wipes ALL data and restores from envelope. Existing API keys
 * are preserved when imported entries have empty apiKey fields (since export
 * strips keys for safety).
 */
export async function replaceAll(envelope: ExportEnvelope): Promise<void> {
  const db = getDb();

  // Capture existing API keys before wipe (so we can restore them after).
  const existingLLM = await llmSettingsRepo.get();
  const existingKeys = new Map<string, string>();
  for (const [name, cfg] of Object.entries(existingLLM.providers)) {
    if (cfg.apiKey) existingKeys.set(name, cfg.apiKey);
  }

  // Wipe all tables.
  await Promise.all([
    db.sessions.clear(),
    db.reflections.clear(),
    db.streak.clear(),
    db.settings.clear(),
    db.llmSettings.clear(),
    db.pendingCalendarOps.clear(),
    db.tokens.clear(),
  ]);

  // Restore sessions.
  if (envelope.sessions.length > 0) {
    await db.sessions.bulkAdd(envelope.sessions);
  }

  // Restore reflections.
  if (envelope.reflections.length > 0) {
    await db.reflections.bulkAdd(envelope.reflections);
  }

  // Restore streak.
  if (envelope.streak) {
    await db.streak.put(envelope.streak);
  }

  // Restore settings.
  if (envelope.settings) {
    await db.settings.put(envelope.settings);
  }

  // Restore llmSettings — preserve existing API keys where envelope has empty.
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
}

// Type re-exports for compatibility with imports in callers
export type { Session, Reflection, Streak, Settings, LLMSettings, PendingCalendarOp, Token };
