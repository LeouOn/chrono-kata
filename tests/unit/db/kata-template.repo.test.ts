import { describe, it, expect, beforeEach } from 'vitest';
import { resetDbForTesting } from '@/lib/db/db';
import { DexieKataTemplateRepository } from '@/lib/db/kata-template.repo';

describe('DexieKataTemplateRepository', () => {
  let repo: DexieKataTemplateRepository;

  beforeEach(async () => {
    await resetDbForTesting();
    repo = new DexieKataTemplateRepository();
  });

  it('seeds default templates when database is empty', async () => {
    const templates = await repo.getAll();
    expect(templates.length).toBe(3);
    expect(templates[0]?.name).toBe('Morning Zazen');
    expect(templates[0]?.mode).toBe('timed');
    expect(templates[0]?.defaultDurationMinutes).toBe(20);
    expect(templates[1]?.name).toBe('Deep Work Sprint');
    expect(templates[2]?.name).toBe('Kata Reps');
    expect(templates[2]?.mode).toBe('reps');
    expect(templates[2]?.defaultReps).toBe(50);
  });

  it('creates a custom kata template', async () => {
    const created = await repo.create({
      name: 'Evening Reflection',
      mode: 'timed',
      defaultDurationMinutes: 15,
      activityLabel: 'Journaling',
      icon: '📖',
      defaultNote: 'Review the day with compassion.',
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Evening Reflection');
    expect(created.icon).toBe('📖');
    expect(created.order).toBeGreaterThanOrEqual(0);

    const fetched = await repo.getById(created.id);
    expect(fetched?.name).toBe('Evening Reflection');
  });

  it('updates an existing kata template', async () => {
    const created = await repo.create({
      name: 'Old Name',
      mode: 'timed',
      defaultDurationMinutes: 10,
    });

    const updated = await repo.update(created.id, {
      name: 'New Focused Name',
      defaultDurationMinutes: 25,
    });

    expect(updated.name).toBe('New Focused Name');
    expect(updated.defaultDurationMinutes).toBe(25);
  });

  it('deletes a kata template', async () => {
    const created = await repo.create({
      name: 'Temporary Routine',
      mode: 'reps',
      defaultReps: 10,
    });

    await repo.delete(created.id);
    const fetched = await repo.getById(created.id);
    expect(fetched).toBeUndefined();
  });

  it('reorders templates correctly', async () => {
    const all = await repo.getAll();
    const ids = all.map((t) => t.id);
    const reversed = [...ids].reverse();

    await repo.reorder(reversed);
    const reordered = await repo.getAll();
    expect(reordered.map((t) => t.id)).toEqual(reversed);
  });
});
