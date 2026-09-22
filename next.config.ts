import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // Registration is decided at runtime so the Android WebView does not install the worker.
  register: false,
});

const isExport = process.env.NEXT_EXPORT === 'true';

const nextConfig: NextConfig = {
  output: isExport ? 'export' : undefined,
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    if (dev) {
      // Use in-memory caching in development to prevent OneDrive file lock/packfile sync collisions
      config.cache = {
        type: 'memory',
      };
    }
    return config;
  },
  headers: isExport
    ? undefined
    : async () => [
        {
          source: '/(.*)',
          headers: [
            {
              key: 'Content-Security-Policy',
              value: [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
                "connect-src 'self' https: http://localhost:* ws://localhost:* ws: wss:",
                "img-src 'self' data: blob: https:",
                "style-src 'self' 'unsafe-inline' https:",
                "font-src 'self' data: https:",
                "worker-src 'self' blob:",
              ].join('; '),
            },
          ],
        },
      ],
};

export default withSerwist(nextConfig);
