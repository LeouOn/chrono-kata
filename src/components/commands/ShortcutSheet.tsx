'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { useFlag } from '@/hooks/useFlags';
import { shortcutCommands, shortcutLabel, visibleCommands } from '@/lib/commands/registry';

/**
 * The keyboard-shortcut sheet, generated from the SAME registry the palette
 * runs (roadmap Wave 19), so a shortcut cannot exist in one and not the other.
 * It is a settings card: the sheet is always reachable without the palette.
 */
export function ShortcutSheet() {
  const enabled = useFlag('taskInbox');
  const [platform, setPlatform] = useState('');
  useEffect(() => setPlatform(navigator.platform ?? ''), []);

  const rows = shortcutCommands(visibleCommands({ isEnabled: () => enabled }));

  return (
    <Card>
      <div id="shortcuts" className="mb-3 text-xs uppercase tracking-wide text-text-muted">
        Keyboard shortcuts
      </div>
      <ul className="space-y-2">
        {rows.map((command) => (
          <li key={command.id} className="flex min-h-11 items-center justify-between gap-3">
            <span className="min-w-0 text-sm text-text">{command.title}</span>
            <kbd className="shrink-0 rounded-lg border border-border bg-surface-2 px-2 py-1 font-mono text-[11px] text-text">
              {shortcutLabel(command.shortcut ?? '', platform)}
            </kbd>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-text-muted">
        In the inbox, keys 1–6 choose an outcome and s skips the item. Escape closes a dialog.
      </p>
    </Card>
  );
}
