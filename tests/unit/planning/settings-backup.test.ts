import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';
import { collectAll } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { CURRENT_ENVELOPE_VERSION } from '@/lib/data-transfer/types';
import { DEFAULT_SETTINGS } from '@/lib/schemas/settings';

const ANCHOR = {
  id: '77777777-7777-4777-8777-777777777777',
  title: 'Trading session',
  weekdays: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '11:30',
  domainId: null,
};

beforeEach(async () => {
  await resetDbForTesting();
});

describe('planning settings in backups', () => {
  it('defaults to 07:00-22:00 and no anchors', () => {
    expect(DEFAULT_SETTINGS.wakingHours).toEqual({ start: '07:00', end: '22:00' });
    expect(DEFAULT_SETTINGS.anchors).toEqual([]);
  });

  it('round-trips waking hours and anchors through the v2 envelope', async () => {
    await settingsRepo.patch({
      wakingHours: { start: '22:00', end: '07:00' },
      anchors: [ANCHOR],
    });

    const envelope = await collectAll();
    expect(envelope.version).toBe(CURRENT_ENVELOPE_VERSION);
    expect(envelope.settings?.wakingHours).toEqual({ start: '22:00', end: '07:00' });
    expect(envelope.settings?.anchors).toHaveLength(1);

    const parsed = parseEnvelope(JSON.stringify(envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toBe(0);
    expect(parsed.envelope.settings?.anchors?.[0]?.title).toBe('Trading session');

    await resetDbForTesting();
    await replaceAll(parsed.envelope);
    const stored = await settingsRepo.get();
    expect(stored.wakingHours).toEqual({ start: '22:00', end: '07:00' });
    expect(stored.anchors?.[0]).toMatchObject({ start: '09:00', end: '11:30', weekdays: [1, 2, 3, 4, 5] });
  });

  it('rejects an invalid clock or anchor rather than storing it', async () => {
    const envelope = await collectAll();
    const raw = JSON.parse(JSON.stringify(envelope)) as { settings: Record<string, unknown> };
    raw.settings.anchors = [{ ...ANCHOR, start: '25:00' }];

    const parsed = parseEnvelope(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Settings that fail validation are dropped, not partially applied.
    expect(parsed.envelope.settings).toBeNull();
  });
});
