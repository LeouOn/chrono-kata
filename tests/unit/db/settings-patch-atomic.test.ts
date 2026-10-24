import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTesting } from '@/lib/db/db';
import { settingsRepo } from '@/lib/db/settings.repo';

/**
 * `settingsRepo.patch` is a read-modify-write. Several surfaces patch on every
 * change (the two waking-hours inputs both save onChange), so two patches can
 * overlap. With a plain get-then-put, both read the old row and the later write
 * silently drops the earlier field: a lost update that made
 * `tests/e2e/w6-planning-settings.spec.ts` flaky ("Awake from" reverted to its
 * default after a reload).
 */
describe('settingsRepo.patch is one transaction', () => {
  beforeEach(async () => {
    await resetDbForTesting();
  });

  it('keeps every field when several patches start together', async () => {
    await Promise.all([
      settingsRepo.patch({ displayName: 'Ada' }),
      settingsRepo.patch({ recoveryMode: true }),
      settingsRepo.patch({ restDays: ['sun', 'sat'] }),
    ]);

    const saved = await settingsRepo.get();
    expect(saved.displayName).toBe('Ada');
    expect(saved.recoveryMode).toBe(true);
    expect(saved.restDays).toEqual(['sun', 'sat']);
  });

  it('lets the last of two same-field patches win, and keeps the other fields', async () => {
    await settingsRepo.patch({ displayName: 'Ada' });
    await Promise.all([
      settingsRepo.patch({ lowEnergyRestThreshold: 1 }),
      settingsRepo.patch({ lowEnergyRestThreshold: 3 }),
    ]);

    const saved = await settingsRepo.get();
    expect(saved.lowEnergyRestThreshold).toBe(3);
    expect(saved.displayName).toBe('Ada');
  });

  it('keeps both flags when setFlag is called twice together', async () => {
    await Promise.all([settingsRepo.setFlag('taskInbox', true), settingsRepo.setFlag('sync', true)]);
    const saved = await settingsRepo.get();
    expect(saved.flags?.taskInbox).toBe(true);
    expect(saved.flags?.sync).toBe(true);

    // In a row works too, and turning one off leaves the other alone.
    await settingsRepo.setFlag('taskInbox', false);
    const afterToggle = await settingsRepo.get();
    expect(afterToggle.flags?.taskInbox).toBe(false);
    expect(afterToggle.flags?.sync).toBe(true);
  });

  it('keeps the last of two waking-hours writes and the other settings', async () => {
    // Both inputs save on change; the second value follows the first.
    await Promise.all([
      settingsRepo.patch({ wakingHours: { start: '08:00', end: '22:00' } }),
      settingsRepo.patch({ wakingHours: { start: '08:00', end: '21:00' } }),
      settingsRepo.patch({ displayName: 'Ada' }),
    ]);
    const saved = await settingsRepo.get();
    expect(saved.wakingHours).toEqual({ start: '08:00', end: '21:00' });
    expect(saved.displayName).toBe('Ada');
  });

  it('keeps one flag when setFlag and a patch overlap', async () => {
    await Promise.all([
      settingsRepo.setFlag('taskInbox', true),
      settingsRepo.patch({ displayName: 'Grace' }),
      settingsRepo.setFlag('privateMode', true),
    ]);

    const saved = await settingsRepo.get();
    expect(saved.flags?.taskInbox).toBe(true);
    expect(saved.flags?.privateMode).toBe(true);
    expect(saved.displayName).toBe('Grace');
  });
});
