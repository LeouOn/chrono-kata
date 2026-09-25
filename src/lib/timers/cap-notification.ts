const CAP_NOTIFICATION_ID = 4101;

export async function scheduleCapNotification(at: Date): Promise<void> {
  if (at.getTime() <= Date.now()) return;
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') return;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: CAP_NOTIFICATION_ID,
        title: 'chrono-kata',
        body: "That's your cap for today. A good place to stop.",
        schedule: { at },
      },
    ],
  });
}

export async function cancelCapNotification(): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: [{ id: CAP_NOTIFICATION_ID }] });
}
