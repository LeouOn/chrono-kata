import { sessionRepo } from '@/lib/db/session.repo';
import { reflectionRepo } from '@/lib/db/reflection.repo';
import { streakRepo } from '@/lib/db/streak.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import type { ExportEnvelope } from './types';

/**
 * Collect all user data into an exportable envelope. API keys are stripped
 * from LLM provider configs for safe export (importing on a new device
 * requires re-entering keys).
 */
export async function collectAll(): Promise<ExportEnvelope> {
  const [sessions, reflections, streak, settings, llmSettings] = await Promise.all([
    sessionRepo.getAll(),
    reflectionRepo.getAll(),
    streakRepo.get(),
    settingsRepo.get(),
    llmSettingsRepo.get(),
  ]);

  // Strip API keys.
  const safeLLMSettings = llmSettings
    ? {
        ...llmSettings,
        providers: Object.fromEntries(
          Object.entries(llmSettings.providers).map(([name, cfg]) => [
            name,
            { ...cfg, apiKey: '' },
          ])
        ),
      }
    : null;

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions,
    reflections,
    streak,
    settings,
    llmSettings: safeLLMSettings,
  };
}

/**
 * Trigger a JSON file download of the export envelope.
 */
export function downloadExport(envelope: ExportEnvelope): void {
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chrono-kata-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
