'use client';

import { Card } from '@/components/ui/Card';
import { dispatchToast } from '@/components/ui/Toast';
import { useFlags } from '@/hooks/useFlags';

/**
 * Private mode: the switch, and an honest account of what it does not cover.
 *
 * The wording matters more than the toggle. Private mode is about **LLM
 * traffic**, and a user who turns it on should not read it as "nothing leaves
 * this device" — Google Calendar sync and exports are separate, deliberate
 * choices that live outside it.
 */
export function PrivateModeCard() {
  const { isEnabled, setFlag } = useFlags();
  const privateMode = isEnabled('privateMode');

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">Private mode</div>
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-sm text-text">Keep AI traffic on this machine or your network</span>
        <input
          type="checkbox"
          checked={privateMode}
          onChange={(e) =>
            void setFlag('privateMode', e.target.checked).catch((error: unknown) =>
              dispatchToast(
                error instanceof Error ? error.message : 'Failed to save private mode',
                'error',
              ),
            )
          }
          className="accent-accent w-4 h-4"
        />
      </label>
      <p className="text-xs text-text-muted mt-3">
        While this is on, a request to any provider that is not a local host — this machine, your
        own network, or a <code>.local</code> name — is refused before it is made. That covers every
        AI surface: the session coach comment, the coach conversation, the daily briefing, the
        weekly reflection and the label suggestion. It does <strong>not</strong> cover other
        traffic: Google Calendar sync still sends your sessions to Google, an export still writes a
        file wherever you choose, and a local server that redirects to a public address would send
        the request there — private mode checks where a request is addressed, not where it ends up.
      </p>
    </Card>
  );
}
