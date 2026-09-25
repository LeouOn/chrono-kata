/** Screen Wake Lock. Used instead of a Capacitor keep-awake plugin, which has no Capacitor 8 release. */
export async function requestScreenWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if (!('wakeLock' in navigator)) return null;
    return await navigator.wakeLock.request('screen');
  } catch {
    return null;
  }
}
