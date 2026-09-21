import { describe, it, expect, beforeEach } from 'vitest';
import { habitRepo } from '@/lib/db/habit.repo';
import { resetDbForTesting } from '@/lib/db/db';

beforeEach(async () => {
  await resetDbForTesting();
});

describe('habitRepo', () => {
  it('creates and lists habits in order', async () => {
    await habitRepo.create({ name: 'Water plants', kind: 'boolean', targetPerDay: null, schedule: { kind: 'daily' } });
    await habitRepo.create({ name: 'Reading', kind: 'count', unit: 'pages', targetPerDay: 10, schedule: { kind: 'daily' } });

    const all = await habitRepo.getAll();
    expect(all.map((h) => h.name)).toEqual(['Water plants', 'Reading']);
  });

  it('updates fields and validates', async () => {
    const created = await habitRepo.create({ name: 'Water plants', kind: 'boolean', targetPerDay: null, schedule: { kind: 'daily' } });
    const updated = await habitRepo.update(created.id, { name: 'Water the plants' });
    expect(updated.name).toBe('Water the plants');

    await expect(
      habitRepo.update(created.id, { kind: 'timed', targetPerDay: null })
    ).rejects.toThrow();
  });

  it('archives and unarchives without losing logs or record', async () => {
    const created = await habitRepo.create({ name: 'Reading', kind: 'count', unit: 'pages', targetPerDay: 10, schedule: { kind: 'daily' } });
    await habitRepo.update(created.id, { archivedAt: new Date() });
    expect((await habitRepo.getById(created.id))?.archivedAt).toBeInstanceOf(Date);
    await habitRepo.update(created.id, { archivedAt: null });
    expect((await habitRepo.getById(created.id))?.archivedAt).toBeNull();
  });

  it('reorders via id list', async () => {
    const a = await habitRepo.create({ name: 'A', kind: 'boolean', targetPerDay: null, schedule: { kind: 'daily' } });
    const b = await habitRepo.create({ name: 'B', kind: 'boolean', targetPerDay: null, schedule: { kind: 'daily' } });
    await habitRepo.reorder([b.id, a.id]);
    expect((await habitRepo.getAll()).map((h) => h.name)).toEqual(['B', 'A']);
  });
});
