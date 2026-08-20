import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    // Expose standard system/desktop environment variables (without NEXT_PUBLIC_)
    DEFAULT_PROVIDER: process.env.DEFAULT_PROVIDER,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
    CLAUDE_BASE_URL: process.env.CLAUDE_BASE_URL,
    CLAUDE_MODEL: process.env.CLAUDE_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GEMINI_BASE_URL: process.env.GEMINI_BASE_URL,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
    ZAI_API_KEY: process.env.ZAI_API_KEY,
    ZAI_BASE_URL: process.env.ZAI_BASE_URL,
    ZAI_MODEL: process.env.ZAI_MODEL,
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
    MINIMAX_BASE_URL: process.env.MINIMAX_BASE_URL,
    MINIMAX_MODEL: process.env.MINIMAX_MODEL,
    NEMOTRON_API_KEY: process.env.NEMOTRON_API_KEY,
    NEMOTRON_BASE_URL: process.env.NEMOTRON_BASE_URL,
    NEMOTRON_MODEL: process.env.NEMOTRON_MODEL,
    OLLAMA_ENABLED: process.env.OLLAMA_ENABLED,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Use in-memory caching in development to prevent OneDrive file lock/packfile sync collisions
      config.cache = {
        type: 'memory',
      };
    }
    return config;
  },
  async headers() {
    return [
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
    ];
  },
};

export default withSerwist(nextConfig);
