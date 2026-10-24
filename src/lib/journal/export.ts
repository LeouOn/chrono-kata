import { addDays, isDayKey } from '@/lib/pacing/days';
import { localWeekday } from '@/lib/planning/time';
import { formatWeekLabel, mondayOf } from '@/lib/review/week';
import type { DayPlan } from '@/lib/schemas/day-plan';
import type { Domain } from '@/lib/schemas/domain';
import type { Task } from '@/lib/schemas/task';

/**
 * Markdown export of journal entries (roadmap Wave 12), per day, week and month.
 *
 * Three promises, all testable:
 *
 * 1. **Derived**: the export is built from stored rows every time. It contains
 *    only what the person wrote — their journal, shutdown note, tomorrow's
 *    first move, the tasks they planned, the domains they ticked. No AI text
 *    and no derived commentary ever enters it.
 * 2. **Safe**: every line of user text is rendered inside a blockquote (`> `),
 *    so a journal line like `# not a heading` or a backtick run cannot open a
 *    heading, list, table or code fence in the surrounding document.
 * 3. **Deterministic**: the same rows produce the same bytes. Plans are ordered
 *    by date, domains by their display order then id, tasks by id.
 *
 * Days, weeks and months are LOCAL calendar concepts: the week starts on Monday
 * (`mondayOf`/`formatWeekLabel`), the month is the local calendar month, and a
 * day is a local day key. Nothing here does millisecond arithmetic.
 */

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface JournalExportInput {
  plans: readonly DayPlan[];
  tasks: readonly Task[];
  domains: readonly Domain[];
}

/** Monday-first weekday name for a local day key. */
export function weekdayName(dayKey: string): string {
  return WEEKDAY_NAMES[localWeekday(dayKey)] ?? '';
}

/** "Monday 15 June 2026", from the bare calendar date (UTC), so no zone drift. */
export function formatLongDate(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  const month = MONTH_NAMES[m - 1] ?? '';
  return `${weekdayName(dayKey)} ${d} ${month} ${y}`;
}

/** "June 2026". */
export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1] ?? ''} ${y}`;
}

/** Every line of user text, quoted so it cannot change the document structure. */
export function quoteBlock(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n');
}

/** One line of user text (a task title), flattened so it stays a single list item. */
function inline(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function sortedDomains(domains: readonly Domain[]): Domain[] {
  return [...domains].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function section(heading: string, body: string[]): string[] {
  const content = body.filter((line) => line !== '');
  if (content.length === 0) return [];
  return [`### ${heading}`, '', ...content, ''];
}

/** The day's sections (no date heading). Empty when the day has nothing to say. */
function dayBody(plan: DayPlan, taskById: Map<string, Task>, domains: readonly Domain[]): string[] {
  const lines: string[] = [];

  if (plan.journal && plan.journal.trim() !== '') {
    lines.push(...section('Journal', [quoteBlock(plan.journal)]));
  }

  const picked = plan.picks
    .map((id) => taskById.get(id))
    .filter((task): task is Task => task !== undefined);
  const doneIds = new Set(plan.picksDone ?? []);
  const backIds = new Set(plan.picksBack ?? []);
  const done = picked.filter((task) => doneIds.has(task.id) || task.status === 'done');
  const back = picked.filter((task) => backIds.has(task.id) && !done.includes(task));
  const planned = picked.filter((task) => !done.includes(task) && !back.includes(task));

  if (done.length > 0) {
    lines.push(...section('What moved', done.sort(byId).map((task) => `- [x] ${inline(task.title)}`)));
  }
  if (back.length > 0) {
    lines.push(
      ...section('Back on the list', back.sort(byId).map((task) => `- [ ] ${inline(task.title)}`)),
    );
  }
  if (planned.length > 0) {
    lines.push(...section('Planned', planned.sort(byId).map((task) => `- [ ] ${inline(task.title)}`)));
  }

  const checks = plan.domainChecks ?? {};
  const ticked = sortedDomains(domains).filter((domain) => domain.id in checks);
  if (ticked.length > 0) {
    lines.push(
      ...section(
        'Domains',
        ticked.map((domain) => `- [${checks[domain.id] ? 'x' : ' '}] ${inline(domain.name)}`),
      ),
    );
  }

  if (plan.shutdownNote && plan.shutdownNote.trim() !== '') {
    lines.push(...section('Shutdown', [quoteBlock(plan.shutdownNote)]));
  }
  if (plan.firstActionTomorrow && plan.firstActionTomorrow.trim() !== '') {
    lines.push(...section("Tomorrow's first move", [quoteBlock(plan.firstActionTomorrow)]));
  }

  return lines;
}

function byId(a: Task, b: Task): number {
  return a.id.localeCompare(b.id);
}

function render(
  plans: readonly DayPlan[],
  input: JournalExportInput,
  heading: string,
  options: { headingPerDay: boolean },
): string {
  const taskById = new Map(input.tasks.map((task) => [task.id, task] as const));
  const ordered = [...plans].sort((a, b) => a.date.localeCompare(b.date));
  const body = ordered.flatMap((plan) => {
    const sections = dayBody(plan, taskById, input.domains);
    if (sections.length === 0) return [];
    return options.headingPerDay ? [`## ${formatLongDate(plan.date)}`, '', ...sections] : sections;
  });
  if (body.length === 0) return `# ${heading}\n\n_No journal entries in this range._\n`;
  return `# ${heading}\n\n${body.join('\n')}`.trimEnd() + '\n';
}

/** One day's entry. */
export function exportDayMarkdown(dayKey: string, input: JournalExportInput): string {
  return render(
    input.plans.filter((plan) => plan.date === dayKey),
    input,
    formatLongDate(dayKey),
    { headingPerDay: false },
  );
}

/** A Monday-based week; `weekOf` is any local day key inside it. */
export function exportWeekMarkdown(weekOf: string, input: JournalExportInput): string {
  const monday = mondayOf(weekOf);
  const end = addDays(monday, 7);
  return render(
    input.plans.filter((plan) => plan.date >= monday && plan.date < end),
    input,
    `Week of ${formatWeekLabel(monday)}`,
    { headingPerDay: true },
  );
}

/** A local calendar month; `monthOf` is any local day key inside it. */
export function exportMonthMarkdown(monthOf: string, input: JournalExportInput): string {
  const monthKey = monthOf.slice(0, 7);
  if (!isDayKey(monthOf)) throw new Error(`Invalid day key "${monthOf}"; expected YYYY-MM-DD`);
  const [y, m] = monthKey.split('-').map(Number) as [number, number];
  const first = `${monthKey}-01`;
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return render(
    input.plans.filter((plan) => plan.date >= first && plan.date < nextMonth),
    input,
    formatMonthLabel(monthKey),
    { headingPerDay: true },
  );
}
