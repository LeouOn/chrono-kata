'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CommandPalette } from './CommandPalette';
import { CAPTURE_EVENT, SESSION_EVENT } from '@/lib/commands/events';
import type { CommandSpec } from '@/lib/commands/registry';

/**
 * Owns the palette and the global shortcut (roadmap Wave 19).
 *
 * Decisions, both documented in the wave note:
 * - **Ctrl/Cmd+K is not inert while focus is in a text field.** It is the app's
 *   one global launcher (it used to open the capture sheet); making it depend on
 *   where the cursor sits is how a shortcut starts feeling unreliable. Modals do
 *   suppress it: while a dialog is open the palette does not open (and Escape
 *   closes it through the shared Modal).
 * - Running a command never writes data on its own: navigation goes to a screen,
 *   capture opens the existing capture sheet, and a session opens the existing
 *   form — the same confirmations as doing it by hand.
 */
export function CommandProvider() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) return;
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
