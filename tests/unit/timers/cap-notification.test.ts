import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestPermissions = vi.fn(async () => ({ display: 'granted' as const }));
const schedule = vi.fn(async (_args: unknown) => undefined);
const cancel = vi.fn(async (_args: unknown) => undefined);
const isNativePlatform = vi.fn(() => true);

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    requestPermissions: () => requestPermissions(),
    schedule: (args: unknown) => schedule(args),
    cancel: (args: unknown) => cancel(args),
  },
}));

describe('cap notifications', () => {
  beforeEach(() => {
    requestPermissions.mockClear();
    schedule.mockClear();
    cancel.mockClear();
    isNativePlatform.mockReturnValue(true);
  });

  it('schedules a cap notification on native and skips the web', async () => {
    const { scheduleCapNotification } = await import('@/lib/timers/cap-notification');
    const at = new Date(Date.now() + 60_000);
    await scheduleCapNotification(at);
    expect(schedule).toHaveBeenCalledOnce();
    const scheduled = schedule.mock.calls[0]?.[0] as { notifications: Array<{ id: number }> };
    expect(scheduled.notifications[0]?.id).toBe(4101);

    isNativePlatform.mockReturnValue(false);
    await scheduleCapNotification(new Date(Date.now() + 60_000));
    expect(schedule).toHaveBeenCalledOnce();
  });

  it('cancels the scheduled notification', async () => {
    const { cancelCapNotification } = await import('@/lib/timers/cap-notification');
    await cancelCapNotification();
    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: 4101 }] });
  });
});
