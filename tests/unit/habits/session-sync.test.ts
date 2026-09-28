import { describe, it, expect, beforeEach } from 'vitest';
import { syncHabitLogsForSession, removeHabitLogsForSession, rebuildSessionHabitLogs, backfillHabitLogsForHabit } from '@/lib/habits/session-sync';
import { habitRepo } from '@/lib/db/habit.repo';
import { habitLogRepo } from '@/lib/db/habit-log.repo';
import { sessionRepo } from '@/lib/db/session.repo';
import { resetDbForTesting } from '@/lib/db/db';
import { kataTemplateRepo } from '@/lib/db/kata-template.repo';
import type { Session } from '@/lib/schemas/session';

beforeEach(async () => {
  await resetDbForTesting();
});

async function saveStretchSession(minutes: number, dayOffset = 0): Promise<Session> {
  const startedAt = new Date();
  startedAt.setDate(startedAt.getDate() + dayOffset);
  return sessionRepo.save({
    startedAt,
    durationMinutes: minutes,
    reps: null,
    rating: 4,
    activityLabel: 'Daily stretches',
  });
}

async function createStretchHabit() {
  return habitRepo.create({
    name: 'Stretching',
    kind: 'timed',
    targetPerDay: 3.5,
    schedule: { kind: 'daily' },
    linkedActivityLabel: 'Daily stretches',
  });
}

describe('syncHabitLogsForSession', () => {
  it('creates exactly one log per saved session and never duplicates on re-sync', async () => {
    const habit = await createStretchHabit();
    const session = await saveStretchSession(3.5);

    await syncHabitLogsForSession(session);
    await syncHabitLogsForSession(session);
    await syncHabitLogsForSession(session);

    const logs = await habitLogRepo.getForHabitAndDate(habit.id, logs_today());
    expect(logs).toHaveLength(1);
    expect(logs[0]?.minutes).toBe(3.5);
    expect(logs[0]?.source).toBe('session');
  });

  it('updates the entry when the session duration changes', async () => {
    const habit = await createStretchHabit();
    const session = await saveStretchSession(3.5);
    await syncHabitLogsForSession(session);

    const updated = await sessionRepo.update(session.id, { durationMinutes: 7 });
    await syncHabitLogsForSession(updated);

    const logs = await habitLogRepo.getForHabitAndDate(habit.id, logs_today());
    expect(logs).toHaveLength(1);
    expect(logs[0]?.minutes).toBe(7);
  });

  it('removes derived logs when the session is deleted', async () => {
    const habit = await createStretchHabit();
    const session = await saveStretchSession(3.5);
    await syncHabitLogsForSession(session);

    await removeHabitLogsForSession(session.id);
    expect(await habitLogRepo.getForHabitAndDate(habit.id, logs_today())).toHaveLength(0);
  });

  it('sums two routines on the same day without double counting', async () => {
    const habit = await createStretchHabit();
    const a = await saveStretchSession(3.5);
    const b = await saveStretchSession(3.5);
    await syncHabitLogsForSession(a);
    await syncHabitLogsForSession(b);

    const logs = await habitLogRepo.getForHabitAndDate(habit.id, logs_today());
    expect(logs).toHaveLength(2);
    expect(logs.reduce((sum, l) => sum + (l.minutes ?? 0), 0)).toBe(7);
  });

  it('marks boolean habits from a matching session and ignores count habits and mismatched labels', async () => {
    const boolHabit = await habitRepo.create({
      name: 'Moved today',
      kind: 'boolean',
      targetPerDay: null,
      schedule: { kind: 'daily' },
      linkedActivityLabel: 'daily stretches',
    });
    await habitRepo.create({
      name: 'Pushups',
      kind: 'count',
      unit: 'reps',
      targetPerDay: 20,
      schedule: { kind: 'daily' },
      linkedActivityLabel: 'Daily stretches',
    });
    await habitRepo.create({
      name: 'Unrelated',
      kind: 'timed',
      targetPerDay: 10,
      schedule: { kind: 'daily' },
      linkedActivityLabel: 'Reading',
    });

    const session = await saveStretchSession(3.5);
    await syncHabitLogsForSession(session);

    expect(await habitLogRepo.getForHabitAndDate(boolHabit.id, logs_today())).toHaveLength(1);
    const all = await habitLogRepo.getForDate(logs_today());
    expect(all).toHaveLength(1);
  });

  it('skips reps-only sessions for timed habits', async () => {
    const habit = await createStretchHabit();
    const session = await sessionRepo.save({
      startedAt: new Date(),
      durationMinutes: null,
      reps: 50,
      rating: 3,
      activityLabel: 'Daily stretches',
    });
    await syncHabitLogsForSession(session);
    expect(await habitLogRepo.getForDate(logs_today())).toHaveLength(0);
  });
});

describe('backfillHabitLogsForHabit', () => {
  it('derives history from existing sessions when the link is created later', async () => {
    await saveStretchSession(3.5, -1);
    await saveStretchSession(3.5);
    const habit = await createStretchHabit();

    await backfillHabitLogsForHabit(habit);

    const all = await habitLogRepo.getForDate(yesterday());
    expect(all).toHaveLength(1);
    expect(await habitLogRepo.getForDate(logs_today())).toHaveLength(1);
  });
});

describe('rebuildSessionHabitLogs', () => {
  it('is deterministic: rebuild twice yields the same single entry per session', async () => {
    const habit = await createStretchHabit();
    await saveStretchSession(3.5);
    await saveStretchSession(3.5, -1);

    await rebuildSessionHabitLogs();
    await rebuildSessionHabitLogs();

    const today = await habitLogRepo.getForHabitAndDate(habit.id, logs_today());
    const yday = await habitLogRepo.getForHabitAndDate(habit.id, yesterday());
    expect(today).toHaveLength(1);
    expect(yday).toHaveLength(1);
  });

  it('drops derived logs whose session no longer exists', async () => {
    const habit = await createStretchHabit();
    const session = await saveStretchSession(3.5);
    await syncHabitLogsForSession(session);
    await sessionRepo.delete(session.id);

    await rebuildSessionHabitLogs();

    expect(await habitLogRepo.getForDate(logs_today())).toHaveLength(0);
  });
});

describe('id-linked habits', () => {
  it('keeps progress when the kata is renamed and the session label no longer matches', async () => {
    const template = await kataTemplateRepo.create({
      name: 'Walk',
      mode: 'timed',
      defaultDurationMinutes: 20,
    });
    const habit = await habitRepo.create({
      name: 'Walking',
      kind: 'timed',
      targetPerDay: 20,
      schedule: { kind: 'daily' },
      linkedKataTemplateId: template.id,
    });
    const session = await sessionRepo.save({
      startedAt: new Date(),
      durationMinutes: 20,
      reps: null,
      rating: 4,
      activityLabel: 'Evening stroll',
      kataTemplateId: template.id,
    });
    await kataTemplateRepo.update(template.id, { name: 'Evening stroll' });
    await syncHabitLogsForSession(session);

    const logs = await habitLogRepo.getForHabitAndDate(habit.id, logs_today());
    expect(logs).toHaveLength(1);
    expect((await kataTemplateRepo.getById(template.id))?.name).toBe('Evening stroll');
  });
});

function logs_today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
