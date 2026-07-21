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
              "connect-src 'self' https://api.openai.com https://api.deepseek.com https://openrouter.ai https://open.bigmodel.cn https://api.minimax.chat https://integrate.api.nvidia.com http://localhost:11434 https://generativelanguage.googleapis.com https://api.anthropic.com https://oauth2.googleapis.com https://www.googleapis.com",
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
