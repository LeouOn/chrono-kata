import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "connect-src 'self' https: http://localhost:*",
              "img-src 'self' data: blob:",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
