'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useFlag } from '@/hooks/useFlags';
import {
  filterCommands,
  paletteCommands,
  shortcutLabel,
  type CommandSpec,
} from '@/lib/commands/registry';
import { PALETTE_DIALOG_ATTRIBUTE } from '@/lib/commands/palette-guard';

interface Props {
  open: boolean;
  onClose: () => void;
  onRun: (command: CommandSpec) => void;
}

/**
 * The command palette (roadmap Wave 19). A listbox of the registry's commands,
 * filtered as you type; Enter runs the active one, arrows move, Escape closes
 * (the shared Modal owns the focus trap and returns focus where it was).
 */
export function CommandPalette({ open, onClose, onRun }: Props) {
  const enabled = useFlag('taskInbox');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [platform, setPlatform] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo(
    () => filterCommands(paletteCommands({ isEnabled: () => enabled }), query),
    // `visibleCommands` only needs to know about the one flag the registry uses.
    [enabled, query],
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  useEffect(() => setPlatform(navigator.platform ?? ''), []);

  useEffect(() => {
    if (!open) return;
    // Focus the search field on open; the Modal already traps Tab inside.
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function runAt(index: number) {
    const command = commands[index];
    if (!command) return;
    onRun(command);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Commands"
      panelAttributes={{ [PALETTE_DIALOG_ATTRIBUTE]: 'true' }}
    >
      <div className="space-y-3">
        <label className="sr-only" htmlFor="command-search">
          Type a command
        </label>
        <input
          id="command-search"
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((current) => Math.min(commands.length - 1, current + 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((current) => Math.max(0, current - 1));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              runAt(active);
            }
          }}
          placeholder="Type a command, or a word like “inbox”"
          className="w-full min-h-11 rounded-xl border border-border bg-surface px-3 py-3 text-text"
          aria-controls="command-list"
          aria-activedescendant={commands[active] ? `command-${commands[active].id}` : undefined}
          role="combobox"
          aria-expanded="true"
        />

        <ul id="command-list" role="listbox" aria-label="Commands" className="max-h-80 space-y-1 overflow-y-auto">
          {commands.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">No command matches that.</li>
          ) : null}
          {commands.map((command, index) => (
            <li
              key={command.id}
              id={`command-${command.id}`}
              role="option"
              aria-selected={index === active}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm ${
                index === active ? 'bg-surface-2 text-text' : 'text-text-muted'
              }`}
              onMouseEnter={() => setActive(index)}
              onClick={() => runAt(index)}
            >
              <span className="min-w-0">
                <span className="block truncate text-text">{command.title}</span>
                <span className="block text-[11px] text-text-muted">{command.group}</span>
              </span>
              {command.shortcut ? (
                <span className="shrink-0 text-[11px] text-text-muted">
                  {shortcutLabel(command.shortcut, platform)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
