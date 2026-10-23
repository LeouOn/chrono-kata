import { settingsRepo } from '@/lib/db/settings.repo';
import { LLMException, LLMExceptionKind } from './types';
import type { LLMRouting } from '@/lib/schemas/settings';

/**
 * The app-level state every AI request depends on:
 *
 * - **private mode**: when it is on, only a local provider may be used;
 * - **routing**: which provider each AI surface uses.
 *
 * Both live on the singleton settings row, so the service reads them itself
 * instead of trusting every caller to pass them in. A caller that forgets
 * cannot accidentally bypass private mode.
 */
export interface LLMAppState {
  /** Private mode: only local providers may be used. */
  privateMode: boolean;
  /** Per-feature provider routing, when the user set any. */
  routing?: LLMRouting;
}

async function readFromSettingsRow(): Promise<LLMAppState> {
  try {
    const settings = await settingsRepo.get();
    return {
      privateMode: settings.flags?.privateMode === true,
      routing: settings.llmRouting,
    };
  } catch {
    // Fail closed: if the privacy state cannot be read, nothing is sent.
    throw new LLMException(
      'Could not read the privacy settings, so no request was sent.',
      LLMExceptionKind.PrivacyBlocked,
    );
  }
}

let reader: () => Promise<LLMAppState> = readFromSettingsRow;

/** Read the current private-mode and routing state. */
export function readLLMAppState(): Promise<LLMAppState> {
  return reader();
}

/** Replace the reader. Tests use this; production never calls it. */
export function setLLMAppStateReader(next: () => Promise<LLMAppState>): void {
  reader = next;
}

/** Restore the production reader. */
export function resetLLMAppStateReader(): void {
  reader = readFromSettingsRow;
}
