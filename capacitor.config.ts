import type { CapacitorConfig } from '@capacitor/cli';

// Offline APK by default. Set CAPACITOR_LIVE_RELOAD=true before `cap sync`
// to load a dev server instead. 10.0.2.2 reaches the host from the emulator;
// set CAPACITOR_SERVER_URL to this machine's LAN address for a physical device.
const config: CapacitorConfig = {
  appId: 'com.chronokata.app',
  appName: 'chrono-kata',
  webDir: 'out',
};

if (process.env.CAPACITOR_LIVE_RELOAD === 'true') {
  config.server = {
    url: process.env.CAPACITOR_SERVER_URL || 'http://10.0.2.2:3000',
    cleartext: true,
  };
}

export default config;
