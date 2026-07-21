import Dexie, { type Table } from 'dexie';
import type { Session } from '@/lib/schemas/session';
import type { Reflection } from '@/lib/schemas/reflection';
import type { Streak } from '@/lib/schemas/streak';
import type { Settings } from '@/lib/schemas/settings';
import type { LLMSettings } from '@/lib/schemas/llm-settings';
import type { PendingCalendarOp } from '@/lib/schemas/pending-calendar-op';
import type { Token } from '@/lib/schemas/token';

export class ChronoKataDB extends Dexie {
  sessions!: Table<Session, string>;
  reflections!: Table<Reflection, string>;
  streak!: Table<Streak, 'singleton'>;
  settings!: Table<Settings, 'singleton'>;
  llmSettings!: Table<LLMSettings, 'singleton'>;
  pendingCalendarOps!: Table<PendingCalendarOp, string>;
  tokens!: Table<Token, 'google'>;

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
