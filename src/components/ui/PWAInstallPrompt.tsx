'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { usePWAInstall } from '@/hooks/usePWAInstall';

/**
 * Renders install UI in Settings. Three states:
 * - installed: shows confirmation card
 * - installable (beforeinstallprompt fired): shows install button
 * - otherwise: renders null (no UI clutter when N/A)
 */
export function PWAInstallPrompt() {
  const { canInstall, installed, promptInstall } = usePWAInstall();

  if (installed) {
    return (
      <Card>
        <div className="text-text-muted mb-1 text-xs uppercase tracking-wide">
          Installation
        </div>
        <div className="text-zen text-sm">✓ Installed as PWA</div>
      </Card>
    );
  }

  if (!canInstall) {
    return null;
  }

  return (
    <Card>
      <div className="text-text-muted mb-1 text-xs uppercase tracking-wide">
        Installation
      </div>
      <p className="text-text-muted mb-3 text-sm">
        Install chrono-kata on your device for a full-screen, app-like experience.
      </p>
      <Button onClick={() => void promptInstall()}>Install app</Button>
    </Card>
  );
}
