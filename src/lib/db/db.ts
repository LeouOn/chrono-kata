import Dexie, { type Table } from 'dexie';
import type { Session } from '@/lib/schemas/session';
import type { Reflection } from '@/lib/schemas/reflection';
import type { Streak } from '@/lib/schemas/streak';
import type { Settings } from '@/lib/schemas/settings';
import type { LLMSettings } from '@/lib/schemas/llm-settings';
import type { PendingCalendarOp } from '@/lib/schemas/pending-calendar-op';
import type { Token } from '@/lib/schemas/token';
import type { Conversation } from '@/lib/schemas/conversation';
import type { Message } from '@/lib/schemas/message';
import type { KataTemplate } from '@/lib/schemas/kata-template';
import type { Habit, HabitLog } from '@/lib/schemas/habit';
import type { CheckIn } from '@/lib/schemas/check-in';
import { normalizeActivityName } from '@/lib/habits/schedule';

export class ChronoKataDB extends Dexie {
  sessions!: Table<Session, string>;
  reflections!: Table<Reflection, string>;
  streak!: Table<Streak, 'singleton'>;
  settings!: Table<Settings, 'singleton'>;
  llmSettings!: Table<LLMSettings, 'singleton'>;
  pendingCalendarOps!: Table<PendingCalendarOp, string>;
  tokens!: Table<Token, 'google'>;
  conversations!: Table<Conversation, string>;
  messages!: Table<Message, string>;
  kataTemplates!: Table<KataTemplate, string>;
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  checkIns!: Table<CheckIn, string>;

  constructor() {
    super('chrono-kata');
    this.version(1).stores({
      sessions: 'id, startedAt, calendarEventId',
      reflections: 'id, periodStart, periodEnd',
      streak: 'id',
      settings: 'id',
      llmSettings: 'id',
      pendingCalendarOps: 'id, sessionId',
      tokens: 'id',
    });
    // Wave 11: add conversation/message tables + session.conversationId index.
    this.version(2).stores({
      sessions: 'id, startedAt, calendarEventId, conversationId',
      reflections: 'id, periodStart, periodEnd',
      streak: 'id',
      settings: 'id',
      llmSettings: 'id',
      pendingCalendarOps: 'id, sessionId',
      tokens: 'id',
      conversations: 'id, sessionId',
      messages: 'id, conversationId, parentId',
    });
    // Wave 14: add kataTemplates table for quick-start practice routines.
    this.version(3).stores({
      sessions: 'id, startedAt, calendarEventId, conversationId',
      reflections: 'id, periodStart, periodEnd',
      streak: 'id',
      settings: 'id',
      llmSettings: 'id',
      pendingCalendarOps: 'id, sessionId',
      tokens: 'id',
      conversations: 'id, sessionId',
      messages: 'id, conversationId, parentId',
      kataTemplates: 'id, name, order, createdAt',
    });
    // Habits: add habit definitions + dated progress logs.
    this.version(4).stores({
      sessions: 'id, startedAt, calendarEventId, conversationId',
      reflections: 'id, periodStart, periodEnd',
      streak: 'id',
      settings: 'id',
      llmSettings: 'id',
      pendingCalendarOps: 'id, sessionId',
      tokens: 'id',
      conversations: 'id, sessionId',
      messages: 'id, conversationId, parentId',
      kataTemplates: 'id, name, order, createdAt',
      habits: 'id, order',
      habitLogs: 'id, habitId, date, sessionId, [habitId+date]',
    });
    // Pacing T1: morning check-ins, one per local day (keyed by YYYY-MM-DD).
    this.version(5).stores({
      sessions: 'id, startedAt, calendarEventId, conversationId',
      reflections: 'id, periodStart, periodEnd',
      streak: 'id',
      settings: 'id',
      llmSettings: 'id',
      pendingCalendarOps: 'id, sessionId',
      tokens: 'id',
      conversations: 'id, sessionId',
      messages: 'id, conversationId, parentId',
      kataTemplates: 'id, name, order, createdAt',
      habits: 'id, order',
      habitLogs: 'id, habitId, date, sessionId, [habitId+date]',
      checkIns: 'date',
    });
    // Pacing T8: remember which kata a session or habit came from.
    this.version(6)
      .stores({
        sessions: 'id, startedAt, calendarEventId, conversationId, kataTemplateId',
        reflections: 'id, periodStart, periodEnd',
        streak: 'id',
        settings: 'id',
        llmSettings: 'id',
        pendingCalendarOps: 'id, sessionId',
        tokens: 'id',
        conversations: 'id, sessionId',
        messages: 'id, conversationId, parentId',
        kataTemplates: 'id, name, order, createdAt',
        habits: 'id, order',
        habitLogs: 'id, habitId, date, sessionId, [habitId+date]',
        checkIns: 'date',
      })
      .upgrade(async (tx) => {
        const templates = await tx.table('kataTemplates').toArray();
        const byName = new Map<string, string>();
        for (const template of templates) {
          const key = normalizeActivityName(template.name);
          if (key && !byName.has(key)) byName.set(key, template.id);
        }
        const idFor = (label: string | null | undefined) => {
          const key = normalizeActivityName(label);
          return key ? byName.get(key) : undefined;
        };
        await tx.table('sessions').toCollection().modify((session) => {
          if (session.kataTemplateId) return;
          const id = idFor(session.activityLabel);
          if (id) session.kataTemplateId = id;
        });
        await tx.table('habits').toCollection().modify((habit) => {
          if (habit.linkedKataTemplateId) return;
          const id = idFor(habit.linkedActivityLabel);
          if (id) habit.linkedKataTemplateId = id;
        });
      });
  }
}

let dbInstance: ChronoKataDB | null = null;

export function getDb(): ChronoKataDB {
  if (!dbInstance) {
    dbInstance = new ChronoKataDB();
  }
  return dbInstance;
}

// Test helper — resets the singleton and wipes data (used in beforeEach)
export async function resetDbForTesting(): Promise<ChronoKataDB> {
  if (dbInstance) {
    dbInstance.close();
  }
  await Dexie.delete('chrono-kata');
  dbInstance = new ChronoKataDB();
  return dbInstance;
}
