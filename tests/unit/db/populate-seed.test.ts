import { describe, it, expect, vi } from 'vitest';
import { seedDefaultDomainsOnPopulate } from '@/lib/db/db';

/**
 * Regression: seeding the default domains on a fresh install must never leave
 * an unhandled promise rejection.
 *
 * The populate transaction can be aborted (the database is deleted while it is
 * still opening), and the seed then rejects. With a bare `void promise` that
 * rejection escapes as an unhandled rejection, which fails the whole Vitest
 * run under some timezones (it surfaced as
 * `domains.bulkPut(): 4 of 4 operations failed ... AbortError`).
 */
describe('seedDefaultDomainsOnPopulate', () => {
  it('swallows a failed seed instead of leaving an unhandled rejection', async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      seedDefaultDomainsOnPopulate({
        count: async () => 0,
        bulkPut: async () => {
          throw new Error('transaction aborted');
        },
      });
      // Let the rejected promise settle before checking.
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(rejections).toEqual([]);
  });

  it('still seeds the four default domains when the table is empty', async () => {
    const bulkPut = vi.fn().mockResolvedValue(undefined);

    seedDefaultDomainsOnPopulate({ count: async () => 0, bulkPut });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(bulkPut).toHaveBeenCalledTimes(1);
    expect(bulkPut.mock.calls[0]?.[0]).toHaveLength(4);
  });
});
