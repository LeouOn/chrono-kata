import type { Session } from '@/lib/schemas/session';
import type { Reflection } from '@/lib/schemas/reflection';
import type { Streak } from '@/lib/schemas/streak';
import type { Settings } from '@/lib/schemas/settings';
import type { LLMSettings } from '@/lib/schemas/llm-settings';

export interface ExportEnvelope {
  version: 1;
  exportedAt: string; // ISO
  sessions: Session[];
  reflections: Reflection[];
  streak: Streak | null;
  settings: Settings | null;
  llmSettings: LLMSettings | null;
}
