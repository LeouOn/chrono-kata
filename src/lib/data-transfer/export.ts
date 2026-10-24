import { sessionRepo } from '@/lib/db/session.repo';
import { reflectionRepo } from '@/lib/db/reflection.repo';
import { streakRepo } from '@/lib/db/streak.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { kataTemplateRepo } from '@/lib/db/kata-template.repo';
import { checkInRepo } from '@/lib/db/check-in.repo';
import { getDb } from '@/lib/db/db';
import { CURRENT_ENVELOPE_VERSION, type ExportEnvelopeV2, type LeftOutItem } from './types';
import type { BackupSecrets } from './encrypted';
import { toLocalDateString } from '@/lib/utils/date';

/**
 * Collect all user data into an exportable envelope.
 *
 * SECRETS never travel in a plain backup (docs/waves/wave-18.md): API keys, the Google sign-in
 * tokens and the private calendar-feed URL are left out, and the envelope's `leftOut` says so, with
 * how many of each, instead of a backup that is quietly smaller than it looks. Calendar updates still
 * waiting to be sent from this device are left out too: they belong to this device's sessions.
 *
 * Reading never changes data that is there: the single-row records are read as they are stored (the
 * repositories' `get()` also rewrites a stored AI-settings row, merging environment providers into it).
 * Only a device that has no such record yet gets its defaults created, as before.
 */
export async function collectAll(): Promise<ExportEnvelopeV2> {
  const db = getDb();
  const [sessions, reflections, storedStreak, storedSettings, storedLLMSettings, kataTemplates, conversations, messages, habits, habitLogs, checkIns, domains, projects, tasks, blocks, dayPlans, estimates, reviews, reviewDrafts, tokenCount, pendingOpCount] =
    await Promise.all([
      sessionRepo.getAll(),
      reflectionRepo.getAll(),
      db.streak.get('singleton'),
      db.settings.get('singleton'),
      db.llmSettings.get('singleton'),
      kataTemplateRepo.getAll(),
      db.conversations.toArray(),
      db.messages.toArray(),
      db.habits.toArray(),
      db.habitLogs.toArray(),
      checkInRepo.getAll(),
      db.domains.toArray(),
      db.projects.toArray(),
      db.tasks.toArray(),
      db.blocks.toArray(),
      db.dayPlans.toArray(),
      db.estimates.toArray(),
      db.reviews.toArray(),
      db.reviewDrafts.toArray(),
      db.tokens.count(),
      db.pendingCalendarOps.count(),
    ]);

  const streak = storedStreak ?? (await streakRepo.get());
  const settings = storedSettings ?? (await settingsRepo.get());
  const llmSettings = storedLLMSettings ?? (await llmSettingsRepo.get());

  const leftOut: LeftOutItem[] = [];

  // API keys: blanked on every provider. Providers that came from this device's environment are
  // not written at all; the device finds them again by itself.
  const providers = Object.entries(llmSettings.providers);
  const browserProviders = providers.filter(([, cfg]) => cfg.credentialSource !== 'environment');
  const environmentProviders = providers.length - browserProviders.length;
  const keysLeftOut = browserProviders.filter(([, cfg]) => cfg.apiKey).length;
  const safeLLMSettings = {
    ...llmSettings,
    providers: Object.fromEntries(browserProviders.map(([name, cfg]) => [name, { ...cfg, apiKey: '' }])),
  };
  if (keysLeftOut > 0) {
    leftOut.push({ id: 'llmSettings.apiKey', what: 'your API keys', why: 'Keys are secrets. A plain backup never holds them; re-enter them on the new device.', count: keysLeftOut });
  }
  if (environmentProviders > 0) {
    leftOut.push({ id: 'llmSettings.environmentProviders', what: 'AI providers the device set up itself', why: 'They are found again on the device they came from.', count: environmentProviders });
  }

  // The private calendar link is a bearer token: anyone holding it can read the calendar.
  // (Only the link itself is the secret: a stored `null` means "none" and travels as it is.)
  let safeSettings = settings;
  if (settings.icsSubscriptionUrl) {
    const { icsSubscriptionUrl: _link, ...rest } = settings;
    safeSettings = rest;
    leftOut.push({ id: 'settings.icsSubscriptionUrl', what: 'your private calendar link', why: 'The link works like a password for your calendar, so it stays on this device.', count: 1 });
  }

  if (tokenCount > 0) {
    leftOut.push({ id: 'tokens', what: 'your Google Calendar sign-in', why: 'Sign-in tokens are secrets. Connect again on the new device.', count: tokenCount });
  }
  if (pendingOpCount > 0) {
    leftOut.push({ id: 'pendingCalendarOps', what: 'calendar updates waiting to be sent', why: 'They belong to this device and its sign-in.', count: pendingOpCount });
  }

  return {
    version: CURRENT_ENVELOPE_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
    reflections,
    streak,
    settings: safeSettings,
    llmSettings: safeLLMSettings,
    kataTemplates,
    conversations,
    messages,
    habits,
    habitLogs,
    checkIns,
    domains,
    projects,
    tasks,
    blocks,
    dayPlans,
    estimates,
    reviews,
    reviewDrafts,
    leftOut,
  };
}

/**
 * The secrets a plain backup leaves out, collected for an ENCRYPTED backup, and only when the person
 * ticked the box. AI providers found from this device's environment are not secrets of the file: they
 * are found again on their own device.
 */
export async function collectSecrets(): Promise<BackupSecrets> {
  const db = getDb();
  const [llm, token, settings] = await Promise.all([db.llmSettings.get('singleton'), db.tokens.get('google'), db.settings.get('singleton')]);
  const llmApiKeys = Object.fromEntries(
    Object.entries(llm?.providers ?? {})
      .filter(([, cfg]) => cfg.credentialSource !== 'environment' && cfg.apiKey)
      .map(([name, cfg]) => [name, cfg.apiKey]),
  );
  return {
    llmApiKeys,
    googleToken: token ?? null,
    icsSubscriptionUrl: settings?.icsSubscriptionUrl ?? null,
  };
}

/**
 * Trigger a JSON file download of the export envelope.
 */
export function downloadExport(envelope: ExportEnvelopeV2): void {
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chrono-kata-backup-${toLocalDateString(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
