'use client';

import React, { useEffect, useState } from 'react';
import { useFlag } from '@/hooks/useFlags';
import { CaptureButton, CaptureSheet } from './CaptureSheet';
import { CAPTURE_EVENT } from '@/lib/commands/events';

/**
 * Global capture affordance (roadmap Wave 2): a distinct button above the
 * practice FAB. The Ctrl/Cmd+K shortcut now belongs to the command palette
 * (roadmap Wave 19), which requests this sheet with a window event — the button
 * and the palette are the same entry point, and neither is the only one.
 *
 * With the `taskInbox` flag off this renders nothing and listens for nothing.
 */
export function CaptureLauncher() {
  const enabled = useFlag('taskInbox');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const onRequest = () => setOpen(true);
    window.addEventListener(CAPTURE_EVENT, onRequest);
    return () => window.removeEventListener(CAPTURE_EVENT, onRequest);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <CaptureButton onClick={() => setOpen(true)} />
      <CaptureSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
