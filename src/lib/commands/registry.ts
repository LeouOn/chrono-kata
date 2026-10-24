import type { FlagName } from '@/lib/schemas/settings';

/**
 * The command registry (roadmap Wave 19).
 *
 * ONE list feeds both the command palette and the keyboard-shortcut sheet, so a
 * command cannot exist in one and not the other. Every command is also reachable
 * without the palette: navigation commands go to a route that exists in the tab
 * bar or a screen, and the two actions open a control the app already shows (the
 * capture sheet, the new-session form).
 *
 * `flag` makes an entry invisible unless the flag is on: the palette is a
 * shortcut layer over the app, never a way around its flags.
 */

export type CommandActionId = 'capture' | 'session' | 'shortcuts' | 'palette';

/**
 * The launcher's key, in one place: the provider matches it, the palette shows
 * it and the cheat sheet lists it, so the three cannot drift. On Apple the
 * provider accepts ⌘K only (Ctrl+K is the text-field kill-line there).
 */
export const PALETTE_SHORTCUT = 'Ctrl+K';

export interface CommandContext {
  navigate: (href: string) => void;
  run: (action: CommandActionId) => void;
}

export interface CommandSpec {
  id: string;
  title: string;
  /** Palette grouping; also the cheat-sheet section. */
  group: string;
  /** Extra words a search can match (route names, synonyms). */
  keywords?: string[];
  /** Human-readable shortcut label; `mod` is rendered per platform. */
  shortcut?: string;
  flag?: FlagName;
  /** Navigation target, for commands that are just a route. */
  href?: string;
  /** Imperative action, resolved by the provider. */
  action?: CommandActionId;
  /** False for entries the palette itself should not list (it is already open). */
  inPalette?: boolean;
  run: (context: CommandContext) => void;
}

function nav(id: string, title: string, href: string, options: { group?: string; keywords?: string[]; flag?: FlagName } = {}): CommandSpec {
  return {
    id,
    title,
    group: options.group ?? 'Go to',
    keywords: options.keywords,
    flag: options.flag,
    href,
    run: (context) => context.navigate(href),
  };
}

const FLAG = 'taskInbox' as const;

export const COMMANDS: readonly CommandSpec[] = [
  {
    id: 'act.palette',
    title: 'Open the command palette',
    group: 'Anywhere',
    keywords: ['palette', 'commands', 'shortcut', 'search', 'jump'],
    // The same constant the provider matches, so the sheet, the palette and the
    // keyboard cannot drift apart.
    shortcut: PALETTE_SHORTCUT,
    // Not in the palette's own list (it is already open when you could pick
    // it), and not behind the flag: the launcher works for everyone.
    inPalette: false,
    action: 'palette',
    run: (context) => context.run('palette'),
  },
  nav('go.home', 'Home', '/', { keywords: ['today', 'dashboard'] }),
  nav('go.sessions', 'Sessions', '/sessions', { keywords: ['practice', 'log'] }),
  nav('go.reflect', 'Reflect', '/reflect', { keywords: ['week', 'reflection', 'summary'] }),
  nav('go.insights', 'Insights', '/insights', { keywords: ['charts', 'trends', 'heatmap'] }),
  nav('go.llm', 'LLM providers', '/llm', { keywords: ['model', 'ai', 'settings'] }),
  nav('go.settings', 'Settings', '/settings', { keywords: ['theme', 'backup', 'export'] }),
  nav('go.inbox', 'Inbox', '/inbox', {
    flag: FLAG,
    keywords: ['triage', 'process', 'capture', '1-6', 'sort'],
  }),
  nav('go.plan', 'Plan today', '/plan', { flag: FLAG, keywords: ['picks', 'capacity'] }),
  nav('go.timeline', 'Timeline', '/timeline', { flag: FLAG, keywords: ['blocks', 'calendar', 'schedule'] }),
  nav('go.projects', 'Projects', '/projects', { flag: FLAG, keywords: ['portfolio', 'cadence'] }),
  nav('go.journal', 'Journal', '/journal', { flag: FLAG, keywords: ['evening', 'shutdown', 'notes'] }),
  nav('go.review', 'Weekly review', '/review', { flag: FLAG, keywords: ['reflect', 'week', 'closing'] }),
  {
    id: 'act.capture',
    title: 'Capture a task',
    group: 'Actions',
    keywords: ['add', 'new', 'inbox', 'quick'],
    // No shortcut label: capturing is Ctrl+K, a query, Enter - or the button.
    // The sheet must not claim a key that does something else.
    flag: FLAG,
    action: 'capture',
    run: (context) => context.run('capture'),
  },
  {
    id: 'act.session',
    title: 'Start a session',
    group: 'Actions',
    keywords: ['timer', 'practice', 'new'],
    action: 'session',
    run: (context) => context.run('session'),
  },
  {
    id: 'act.shortcuts',
    title: 'Keyboard shortcuts',
    group: 'Actions',
    keywords: ['help', 'keys', 'cheat sheet'],
    action: 'shortcuts',
    run: (context) => context.run('shortcuts'),
  },
];

/** Commands whose flag is on, in registry order. */
export function visibleCommands(flags: { isEnabled: (flag: FlagName) => boolean }): CommandSpec[] {
  return COMMANDS.filter((command) => !command.flag || flags.isEnabled(command.flag));
}

/** What the palette lists: visible commands minus the ones that only belong on the sheet. */
export function paletteCommands(flags: { isEnabled: (flag: FlagName) => boolean }): CommandSpec[] {
  return visibleCommands(flags).filter((command) => command.inPalette !== false);
}

/** Case- and whitespace-insensitive search over the title and keywords. */
/**
 * Filter, then rank: a title that starts with the query beats a title that
 * only contains it, which beats a group match, which beats a keyword hit. That
 * is what makes "capture" put "Capture a task" above "Inbox" (whose keyword
 * says captured tasks land there). Registry order breaks ties.
 */
export function filterCommands(commands: readonly CommandSpec[], query: string): CommandSpec[] {
  const needle = query.replace(/\s+/g, ' ').trim().toLowerCase();
  if (needle === '') return [...commands];

  const score = (command: CommandSpec): number => {
    const title = command.title.toLowerCase();
    if (title.startsWith(needle)) return 0;
    if (title.includes(needle)) return 1;
    if (command.group.toLowerCase().includes(needle)) return 2;
    const keywords = (command.keywords ?? []).join(' ').toLowerCase();
    return keywords.includes(needle) ? 3 : -1;
  };

  return commands
    .map((command, index) => ({ command, index, rank: score(command) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.command);
}

/** The shortcut sheet: every command that has a shortcut, grouped. */
export function shortcutCommands(commands: readonly CommandSpec[]): CommandSpec[] {
  return commands.filter((command) => command.shortcut);
}

/** Render a shortcut label for the platform (⌘ on Apple, Ctrl elsewhere). */
/** Apple platforms get ⌘ labels, and the launcher is Meta-only there. */
export function isApplePlatform(platform: string): boolean {
  return /^(Mac|iPhone|iPad|iPod)/.test(platform);
}

export function shortcutLabel(shortcut: string, platform: string): string {
  if (!shortcut.includes('Ctrl')) return shortcut;
  return isApplePlatform(platform) ? shortcut.replace('Ctrl+', '⌘') : shortcut;
}
