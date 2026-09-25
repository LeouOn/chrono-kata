/**
 * Node on this machine honors TZ when it is set before dates are constructed.
 * Each case sets TZ itself so the file can run under the default Vitest worker.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { toLocalDateString } from '@/lib/utils/date';

const previousTz = process.env.TZ;

afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

function inZone(tz: string, run: () => void) {
  process.env.TZ = tz;
  run();
}

describe('local day keys in Helsinki and Los Angeles', () => {
  it('keeps 23:30 on the local date in Los Angeles, where UTC is already the next day', () => {
    inZone('America/Los_Angeles', () => {
      const evening = new Date(2026, 6, 21, 23, 30);
      expect(toLocalDateString(evening)).toBe('2026-07-21');
      expect(evening.toISOString().slice(0, 10)).toBe('2026-07-22');
    });
  });

  it('keeps 00:30 on the local date in Helsinki, where UTC is still the previous day', () => {
    inZone('Europe/Helsinki', () => {
      const morning = new Date(2026, 6, 21, 0, 30);
      expect(toLocalDateString(morning)).toBe('2026-07-21');
      expect(morning.toISOString().slice(0, 10)).toBe('2026-07-20');
    });
  });
});
