import { describe, it, expect } from 'vitest';
import {
  baseUrlFromHost,
  hostFromBaseUrl,
  isLocalBaseUrl,
  isLocalProvider,
  isLocalProviderName,
} from '@/lib/llm/local-provider';

describe('isLocalProviderName', () => {
  it('knows the local presets', () => {
    expect(isLocalProviderName('ollama')).toBe(true);
    expect(isLocalProviderName('lmstudio')).toBe(true);
  });

  it('does not treat cloud presets as local', () => {
    for (const name of ['openai', 'claude', 'gemini', 'deepseek', 'zai', 'openrouter', 'minimax', 'nemotron']) {
      expect(isLocalProviderName(name)).toBe(false);
    }
  });
});

describe('isLocalBaseUrl', () => {
  it('accepts loopback addresses', () => {
    expect(isLocalBaseUrl('http://localhost:1234/v1')).toBe(true);
    expect(isLocalBaseUrl('http://127.0.0.1:11434/v1')).toBe(true);
    expect(isLocalBaseUrl('http://[::1]:1234/v1')).toBe(true);
  });

  it('accepts private-network addresses', () => {
    expect(isLocalBaseUrl('http://192.168.1.5:1234/v1')).toBe(true);
    expect(isLocalBaseUrl('http://10.0.0.7:1234/v1')).toBe(true);
    expect(isLocalBaseUrl('http://172.16.4.9:1234/v1')).toBe(true);
    expect(isLocalBaseUrl('http://172.32.4.9:1234/v1')).toBe(false);
    expect(isLocalBaseUrl('http://169.254.1.1:1234/v1')).toBe(true);
  });

  it('accepts mDNS names', () => {
    expect(isLocalBaseUrl('http://studio.local:1234/v1')).toBe(true);
  });

  it('rejects cloud addresses and junk', () => {
    expect(isLocalBaseUrl('https://api.openai.com/v1')).toBe(false);
    expect(isLocalBaseUrl('https://generativelanguage.googleapis.com/v1beta')).toBe(false);
    expect(isLocalBaseUrl('not a url')).toBe(false);
    expect(isLocalBaseUrl('')).toBe(false);
  });
});

describe('isLocalProvider', () => {
  it('is local when the base URL is a local address', () => {
    expect(isLocalProvider({ providerName: 'lmstudio', baseUrl: 'http://localhost:1234/v1' })).toBe(true);
    expect(isLocalProvider({ providerName: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' })).toBe(true);
  });

  it('is local when the user pointed a cloud preset at a local address', () => {
    expect(isLocalProvider({ providerName: 'openai', baseUrl: 'http://192.168.1.5:1234/v1' })).toBe(true);
  });

  it('is NOT local when a local preset points at a cloud address', () => {
    // The preset name is a label, not a promise: trusting it would let a
    // request to a public address through private mode.
    expect(isLocalProvider({ providerName: 'lmstudio', baseUrl: 'https://api.openai.com/v1' })).toBe(false);
    expect(isLocalProvider({ providerName: 'ollama', baseUrl: 'http://evil.com/v1' })).toBe(false);
    expect(isLocalProvider({ providerName: 'lmstudio', baseUrl: 'http://localhost.evil.com/v1' })).toBe(false);
  });

  it('is not local for a cloud preset on a cloud address', () => {
    expect(isLocalProvider({ providerName: 'openai', baseUrl: 'https://api.openai.com/v1' })).toBe(false);
    expect(isLocalProvider({ providerName: 'claude', baseUrl: 'https://api.anthropic.com/v1' })).toBe(false);
  });
});

describe('host and base URL helpers', () => {
  it('reads the host out of a base URL', () => {
    expect(hostFromBaseUrl('http://localhost:1234/v1')).toBe('localhost:1234');
    expect(hostFromBaseUrl('http://192.168.1.5:1234/v1')).toBe('192.168.1.5:1234');
    expect(hostFromBaseUrl('http://studio.local/v1')).toBe('studio.local');
    expect(hostFromBaseUrl('nonsense')).toBe('');
  });

  it('builds a base URL from a host', () => {
    expect(baseUrlFromHost('localhost:1234')).toBe('http://localhost:1234/v1');
    expect(baseUrlFromHost('192.168.1.5:1234')).toBe('http://192.168.1.5:1234/v1');
    expect(baseUrlFromHost(' http://studio.local:1234 ')).toBe('http://studio.local:1234/v1');
    expect(baseUrlFromHost('')).toBe('');
  });

  it('round-trips a host through a base URL', () => {
    expect(hostFromBaseUrl(baseUrlFromHost('192.168.1.5:1234'))).toBe('192.168.1.5:1234');
  });
});
