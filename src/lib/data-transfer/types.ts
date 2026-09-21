import type { Session } from '@/lib/schemas/session';
import type { Reflection } from '@/lib/schemas/reflection';
import type { Streak } from '@/lib/schemas/streak';
import type { Settings } from '@/lib/schemas/settings';
import type { LLMSettings } from '@/lib/schemas/llm-settings';
import type { KataTemplate } from '@/lib/schemas/kata-template';
import type { Conversation } from '@/lib/schemas/conversation';
import type { Message } from '@/lib/schemas/message';
import type { Habit, HabitLog } from '@/lib/schemas/habit';

export interface ExportEnvelope {
  version: 1;
  exportedAt: string; // ISO
  sessions: Session[];
  reflections: Reflection[];
  streak: Streak | null;
  settings: Settings | null;
  llmSettings: LLMSettings | null;
  /** Present in newer exports. Absent in legacy files — import preserves local data then. */
  kataTemplates?: KataTemplate[];
  conversations?: Conversation[];
  messages?: Message[];
  habits?: Habit[];
  habitLogs?: HabitLog[];
}
