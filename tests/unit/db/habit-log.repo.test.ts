import { describe, it, expect, beforeEach } from 'vitest';
import { habitLogRepo } from '@/lib/db/habit-log.repo';
import { resetDbForTesting } from '@/lib/db/db';

const HABIT_A = '123e4567-e89b-12d3-a456-42661417400a';
const HABIT_B = '123e4567-e89b-12d3-a456-42661417400b';

beforeEach(async () => {
  await resetDbForTesting();
});

describe('habitLogRepo', () => {
  it('adds and queries by date across habits', async () => {
    await habitLogRepo.add({ habitId: HABIT_A, date: '2026-09-21', delta: 5, minutes: null, source: 'manual' });
    await habitLogRepo.add({ habitId: HABIT_B, date: '2026-09-21', minutes: 3.5, delta: null, source: 'session', sessionId: '123e4567-e89b-12d3-a456-42661417400c' });
    await habitLogRepo.add({ habitId: HABIT_A, date: '2026-09-20', delta: 10, minutes: null, source: 'manual' });

    const forDate = await habitLogRepo.getForDate('2026-09-21');
    expect(forDate).toHaveLength(2);
    const forHabit = await habitLogRepo.getForHabitAndDate(HABIT_A, '2026-09-21');
    expect(forHabit).toHaveLength(1);
  });

  it('upsertForSession is idempotent per habit + session', async () => {
    const input = {
      habitId: HABIT_B,
      date: '2026-09-21',
      minutes: 3.5,
      delta: null,
      source: 'session' as const,
      sessionId: '123e4567-e89b-12d3-a456-42661417400c',
    };
    await habitLogRepo.upsertForSession(input);
    await habitLogRepo.upsertForSession(input);
    await habitLogRepo.upsertForSession({ ...input, minutes: 7 });

    const logs = await habitLogRepo.getForHabitAndDate(HABIT_B, '2026-09-21');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.minutes).toBe(7);
  });

  it('keeps distinct entries per session for the same habit and day', async () => {
    await habitLogRepo.upsertForSession({ habitId: HABIT_B, date: '2026-09-21', minutes: 3.5, delta: null, source: 'session', sessionId: '123e4567-e89b-12d3-a456-42661417400c' });
    await habitLogRepo.upsertForSession({ habitId: HABIT_B, date: '2026-09-21', minutes: 3.5, delta: null, source: 'session', sessionId: '123e4567-e89b-12d3-a456-42661417400d' });

    expect(await habitLogRepo.getForHabitAndDate(HABIT_B, '2026-09-21')).toHaveLength(2);
  });

  it('undo helpers only touch manual entries', async () => {
    await habitLogRepo.add({ habitId: HABIT_A, date: '2026-09-21', delta: 2, minutes: null, source: 'manual' });
    await habitLogRepo.add({ habitId: HABIT_A, date: '2026-09-21', delta: 3, minutes: null, source: 'manual' });

    expect(await habitLogRepo.deleteLatestManualForHabitAndDate(HABIT_A, '2026-09-21')).toBe(true);
    let logs = await habitLogRepo.getForHabitAndDate(HABIT_A, '2026-09-21');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.delta).toBe(2);

    expect(await habitLogRepo.deleteManualForHabitAndDate(HABIT_A, '2026-09-21')).toBe(1);
    expect(await habitLogRepo.deleteLatestManualForHabitAndDate(HABIT_A, '2026-09-21')).toBe(false);
    logs = await habitLogRepo.getForHabitAndDate(HABIT_A, '2026-09-21');
    expect(logs).toHaveLength(0);
  });

  it('deletes by session id and by habit id', async () => {
    const sessionId = '123e4567-e89b-12d3-a456-42661417400c';
    await habitLogRepo.add({ habitId: HABIT_B, date: '2026-09-21', minutes: 3.5, delta: null, source: 'session', sessionId });
    await habitLogRepo.add({ habitId: HABIT_A, date: '2026-09-21', delta: 1, minutes: null, source: 'manual' });

    await habitLogRepo.deleteBySessionId(sessionId);
    expect(await habitLogRepo.getForHabitAndDate(HABIT_B, '2026-09-21')).toHaveLength(0);

    await habitLogRepo.deleteByHabitId(HABIT_A);
    expect(await habitLogRepo.getForDate('2026-09-21')).toHaveLength(0);
  });
});
