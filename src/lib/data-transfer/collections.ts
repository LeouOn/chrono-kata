/**
 * The collections a backup holds, with the words the app uses for them. One list, so the import
 * preview, the merge report and the tests all name things the same way.
 *
 * `key` is both the Dexie table and the key in the file's envelope.
 */
export const COLLECTIONS = [
  { key: 'sessions', singular: 'session', plural: 'sessions' },
  { key: 'reflections', singular: 'reflection', plural: 'reflections' },
  { key: 'kataTemplates', singular: 'kata preset', plural: 'kata presets' },
  { key: 'conversations', singular: 'coach conversation', plural: 'coach conversations' },
  { key: 'messages', singular: 'coach message', plural: 'coach messages' },
  { key: 'habits', singular: 'habit', plural: 'habits' },
  { key: 'habitLogs', singular: 'habit entry', plural: 'habit entries' },
  { key: 'checkIns', singular: 'check-in', plural: 'check-ins' },
  { key: 'domains', singular: 'life area', plural: 'life areas' },
  { key: 'projects', singular: 'project', plural: 'projects' },
  { key: 'tasks', singular: 'task', plural: 'tasks' },
  { key: 'blocks', singular: 'time block', plural: 'time blocks' },
  { key: 'dayPlans', singular: 'day plan', plural: 'day plans' },
  { key: 'estimates', singular: 'estimate', plural: 'estimates' },
  { key: 'reviews', singular: 'weekly review', plural: 'weekly reviews' },
  { key: 'reviewDrafts', singular: 'review draft', plural: 'review drafts' },
] as const;

export type CollectionKey = (typeof COLLECTIONS)[number]['key'];

/** Single-row records: one per device, replaced by a restore and left alone by a merge. */
export const SINGLETONS = [
  { key: 'settings', label: 'settings' },
  { key: 'streak', label: 'streak' },
  { key: 'llmSettings', label: 'AI settings' },
] as const;

/** "1 task", "214 tasks", "1,310 sessions": a fixed locale, so the words never depend on the device. */
export function countOf(n: number, noun: { singular: string; plural: string }): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? noun.singular : noun.plural}`;
}

/** "a, b and c" */
export function joinWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
