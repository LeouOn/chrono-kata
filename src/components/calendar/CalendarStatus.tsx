import type { Settings } from '@/lib/schemas/settings';

interface Props {
  settings: Settings | undefined;
}

export function CalendarStatus({ settings }: Props) {
  if (!settings?.googleCalendarConnectedAt) {
    return <span className="text-xs text-text-muted">Not connected</span>;
  }
  return (
    <span className="text-xs text-zen">
      Connected · {settings.googleCalendarSyncEnabled ? 'syncing' : 'paused'}
    </span>
  );
}
