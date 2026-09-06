'use client';

import { Card } from '@/components/ui/Card';
import { useSettings } from '@/hooks/useSettings';

export function ConfirmationSettings() {
  const { settings, updateSettings } = useSettings();

  const rows = [
    {
      label: 'Before deleting a kata',
      checked: settings?.confirmKataDelete ?? true,
      onChange: (v: boolean) => updateSettings({ confirmKataDelete: v }),
    },
    {
      label: 'Before deleting a session',
      checked: settings?.confirmSessionDelete ?? true,
      onChange: (v: boolean) => updateSettings({ confirmSessionDelete: v }),
    },
    {
      label: 'Before clearing all data',
      checked: settings?.confirmClearData ?? true,
      onChange: (v: boolean) => updateSettings({ confirmClearData: v }),
    },
  ];

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">
        Confirmations
      </div>
      <div className="space-y-2.5">
        {rows.map(({ label, checked, onChange }) => (
          <label
            key={label}
            className="flex items-center justify-between cursor-pointer"
          >
            <span className="text-sm text-text">{label}</span>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => void onChange(e.target.checked)}
              className="accent-accent w-4 h-4"
            />
          </label>
        ))}
      </div>
    </Card>
  );
}
