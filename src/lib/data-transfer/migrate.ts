import { CURRENT_ENVELOPE_VERSION } from './types';

/** A raw (not yet validated) envelope that has been upgraded to the v2 shape. */
export type RawEnvelopeV2 = Record<string, unknown> & { version: 2 };

export type MigrateResult =
  | { ok: true; raw: RawEnvelopeV2 }
  | { ok: false; error: string };

/**
 * Upgrade a parsed backup file to the current envelope shape, one version at a
 * time. Row validation happens afterwards in `parseEnvelope`.
 *
 * - v1 → v2: adds `checkIns: undefined`. Absent collections mean "preserve
 *   local data" on import, so a v1 file never wipes local check-ins.
 */
export function migrateEnvelope(raw: Record<string, unknown>): MigrateResult {
  const version = raw.version;
  if (version !== 1 && version !== CURRENT_ENVELOPE_VERSION) {
    return {
      ok: false,
      error: `Unsupported version: ${String(version ?? 'missing')}. Supported versions: 1–${CURRENT_ENVELOPE_VERSION}.`,
    };
  }

  let current: Record<string, unknown> = raw;
  if (current.version === 1) {
    current = { ...current, version: 2, checkIns: undefined };
  }
  return { ok: true, raw: current as RawEnvelopeV2 };
}
