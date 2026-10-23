'use client';

import React, { useEffect, useState } from 'react';
import { useFlag } from '@/hooks/useFlags';
import { CaptureButton, CaptureSheet } from './CaptureSheet';

/**
 * Global capture affordance (roadmap Wave 2): a distinct button above the
 * practice FAB and the Ctrl/Cmd+K shortcut. W19's command palette will absorb
 * the shortcut later; until then it opens this sheet directly.
 *
 * With the `taskInbox` flag off this renders nothing and binds no key.
 */
export function CaptureLauncher() {
  const enabled = useFlag('taskInbox');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <CaptureButton onClick={() => setOpen(true)} />
      <CaptureSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
