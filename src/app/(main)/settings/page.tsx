'use client';

import { useSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CalendarSettings } from '@/components/calendar/CalendarSettings';

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Settings</h1>

      <Card>
        <div className="text-text-muted text-xs uppercase tracking-wide mb-2">
          Active coach
        </div>
        <div className="font-serif text-xl mb-3 capitalize">
          {settings?.selectedCoachPersonality ?? '—'}
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['zen', 'hype', 'analyst', 'buddy'] as const).map((p) => (
            <Button
              key={p}
              variant={settings?.selectedCoachPersonality === p ? 'primary' : 'ghost'}
              onClick={() => updateSettings({ selectedCoachPersonality: p })}
            >
              {p}
            </Button>
          ))}
        </div>
      </Card>

      <CalendarSettings />

      <Card>
        <div className="text-text-muted text-xs uppercase tracking-wide mb-2">
          Data
        </div>
        <Button variant="danger">Clear all data</Button>
        <p className="text-text-muted text-xs mt-2">
          Wipes IndexedDB and reloads. Cannot be undone.
        </p>
      </Card>
    </div>
  );
}
