'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CommandPalette } from './CommandPalette';
import { CAPTURE_EVENT, SESSION_EVENT } from '@/lib/commands/events';
import { isApplePlatform, type CommandSpec } from '@/lib/commands/registry';

/**
 * Owns the palette and the global shortcut (roadmap Wave 19).
 *
 * Decisions, both documented in the wave note:
 * - **The launcher is Ctrl+K off Apple and ⌘K on Apple.** It is the app's one
 *   global launcher (it used to open the capture sheet), so it does not depend on
 *   where the cursor sits: it opens from inside a text field too. On Apple that
 *   is deliberately Meta-only, because Ctrl+K is the native kill-line there and
 *   hijacking it inside a text field would be a real loss. Modals do suppress it:
 *   while another dialog is open the palette stays shut, and Escape closes it
 *   through the shared Modal.
 * - Running a command never writes data on its own: navigation goes to a screen,
 *   capture opens the existing capture sheet, and a session opens the existing
 *   form — the same confirmations as doing it by hand.
 */
export function CommandProvider() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k') return;
      // Read the platform at event time: Ctrl+K is the text-field kill-line on
      // Apple, so there ⌘K is the launcher and Ctrl+K is left to the field.
      const platform = navigator.platform || navigator.userAgent || '';
      const matches = isApplePlatform(platform)
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
      if (!matches) return;
      event.preventDefault();
      setOpen((current) => {
        // Open: the shortcut toggles the palette shut.
        if (current) return false;
        // Closed: another dialog owns the keyboard, so the palette stays inert.
        return document.querySelectorAll('[role="dialog"]').length === 0;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const run = useCallback(
    (command: CommandSpec) => {
      if (command.href) {
        router.push(command.href);
        return;
      }
      if (command.action === 'capture') window.dispatchEvent(new CustomEvent(CAPTURE_EVENT));
      else if (command.action === 'session') window.dispatchEvent(new CustomEvent(SESSION_EVENT));
      else if (command.action === 'shortcuts') router.push('/settings#shortcuts');
    },
    [router],
  );

  return <CommandPalette open={open} onClose={() => setOpen(false)} onRun={run} />;
}
