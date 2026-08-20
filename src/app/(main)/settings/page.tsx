'use client';

import { useSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CalendarSettings } from '@/components/calendar/CalendarSettings';
import { PWAInstallPrompt } from '@/components/ui/PWAInstallPrompt';
import { DataTransfer } from '@/components/settings/DataTransfer';
import { ReminderSettings } from '@/components/settings/ReminderSettings';
import { ThemeSettings } from '@/components/settings/ThemeSettings';
import { KataTemplateSettings } from '@/components/settings/KataTemplateSettings';
import { GoalSettings } from '@/components/settings/GoalSettings';
import {
  type CoachPersonality,
} from '@/lib/schemas/coach-personality';

const DEFAULT_UNLOCKED: CoachPersonality[] = ['zen', 'hype', 'analyst', 'buddy'];

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const unlocked = settings?.unlockedPersonalities ?? DEFAULT_UNLOCKED;

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Settings</h1>

      <PWAInstallPrompt />

      <Card>
        <div className="text-text-muted text-xs uppercase tracking-wide mb-2">
          Active coach
        </div>
        <div className="font-serif text-xl mb-3 capitalize">
          {settings?.selectedCoachPersonality ?? '—'}
        </div>
        <div className="flex gap-2 flex-wrap">
          {unlocked.map((p) => (
            <Button
              key={p}
              variant={settings?.selectedCoachPersonality === p ? 'primary' : 'ghost'}
              onClick={() => updateSettings({ selectedCoachPersonality: p })}
            >
              {p}
              {p === 'athena' ? ' ✦' : ''}
            </Button>
          ))}
        </div>
        {!unlocked.includes('athena') && (
          <p className="text-text-muted text-xs mt-3 italic">
            More voices may reveal themselves to the patient practitioner.
          </p>
        )}
      </Card>

      <GoalSettings />

      <KataTemplateSettings />

      <ThemeSettings />

      <CalendarSettings />

      <ReminderSettings />

      <Card>
        <div className="text-text-muted text-xs uppercase tracking-wide mb-2">
          Data
        </div>
        <Button variant="danger">Clear all data</Button>
        <p className="text-text-muted text-xs mt-2">
          Wipes IndexedDB and reloads. Cannot be undone.
        </p>
      </Card>

      <DataTransfer />
    </div>
  );
}
