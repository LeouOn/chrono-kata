import { describe, expect, it } from 'vitest';
import {
  COMMANDS,
  filterCommands,
  shortcutCommands,
  shortcutLabel,
  visibleCommands,
} from '@/lib/commands/registry';

const allOn = { isEnabled: () => true };
const allOff = { isEnabled: () => false };

describe('the command registry', () => {
  it('has unique ids, a title and a group for every command', () => {
    const ids = COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const command of COMMANDS) {
      expect(command.title.trim()).not.toBe('');
      expect(command.group.trim()).not.toBe('');
    }
  });

  it('hides flag-gated commands when the flag is off, and shows them when it is on', () => {
    const on = visibleCommands(allOn).map((command) => command.id);
    const off = visibleCommands(allOff).map((command) => command.id);
    expect(on).toContain('go.inbox');
    expect(on).toContain('act.capture');
    expect(off).not.toContain('go.inbox');
    expect(off).not.toContain('act.capture');
    expect(off).toContain('go.home');
    expect(off).toContain('go.sessions');
  });

  it('filters case- and whitespace-insensitively over title, group and keywords', () => {
    const commands = visibleCommands(allOn);
    // "inbox" matches the Inbox screen and the capture action (its keyword),
    // in registry order.
    expect(filterCommands(commands, '  INBOX ').map((command) => command.id)).toEqual([
      'go.inbox',
      'act.capture',
    ]);
    expect(filterCommands(commands, 'cheat   sheet').map((command) => command.id)).toEqual(['act.shortcuts']);
    expect(filterCommands(commands, 'timer').map((command) => command.id)).toEqual(['act.session']);
    expect(filterCommands(commands, 'nothing-matches-this')).toEqual([]);
    expect(filterCommands(commands, '   ').map((command) => command.id)).toEqual(
      commands.map((command) => command.id),
    );
  });

  it('gives the shortcut sheet exactly the commands that have a shortcut', () => {
    const commands = visibleCommands(allOn);
    const sheet = shortcutCommands(commands);
    expect(sheet.length).toBeGreaterThan(0);
    for (const command of commands) {
      expect(sheet.includes(command)).toBe(Boolean(command.shortcut));
    }
  });

  it('renders the shortcut per platform', () => {
    expect(shortcutLabel('Ctrl+K', 'MacIntel')).toBe('⌘K');
    expect(shortcutLabel('Ctrl+K', 'Linux x86_64')).toBe('Ctrl+K');
    expect(shortcutLabel('1–6, s', 'MacIntel')).toBe('1–6, s');
  });

  it('runs navigation and actions through the caller, never by itself', () => {
    const calls: string[] = [];
    const context = {
      navigate: (href: string) => calls.push(`navigate:${href}`),
      run: (action: string) => calls.push(`action:${action}`),
    };
    COMMANDS.find((command) => command.id === 'go.inbox')!.run(context);
    COMMANDS.find((command) => command.id === 'act.capture')!.run(context as never);
    COMMANDS.find((command) => command.id === 'act.session')!.run(context as never);
    expect(calls).toEqual(['navigate:/inbox', 'action:capture', 'action:session']);
  });
});
