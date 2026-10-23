import { describe, it, expect } from 'vitest';
import { isLocalBaseUrl, isLocalProvider } from '@/lib/llm/local-provider';

/**
 * Adversarial cases for the local-provider predicate.
 *
 * This predicate is the privacy boundary of roadmap Wave 5: private mode
 * refuses every provider this does not call local. The dangerous direction is
 * a **host that only looks local** — it must never be classified as local.
 * The harmless direction is a host that only *looks* remote but really is
 * local (a trailing dot, an uppercase name, an alternate numeric spelling):
 * classifying those as non-local is merely inconvenient, but classifying them
 * as local is correct, because that is where the request would actually go.
 */
describe('adversarial base URLs', () => {
  it('does not treat a look-alike host as local', () => {
    expect(isLocalBaseUrl('http://localhost.evil.com/v1')).toBe(false);
    expect(isLocalBaseUrl('http://127.0.0.1.evil.com/v1')).toBe(false);
    expect(isLocalBaseUrl('http://192.168.1.1.evil.com/v1')).toBe(false);
    expect(isLocalBaseUrl('http://10.0.0.1.nip.io/v1')).toBe(false);
    expect(isLocalBaseUrl('http://evil-localhost/v1')).toBe(false);
  });

  it('is not fooled by userinfo', () => {
    // The host is evil.com; the userinfo before the @ is not the host.
    expect(isLocalBaseUrl('http://192.168.1.1@evil.com/v1')).toBe(false);
    expect(isLocalBaseUrl('http://localhost@evil.com/v1')).toBe(false);
    expect(isLocalBaseUrl('http://evil.com@192.168.1.1/v1')).toBe(true);
  });

  it('is not fooled by a fragment or a path that looks like an address', () => {
    expect(isLocalBaseUrl('http://evil.com#127.0.0.1')).toBe(false);
    expect(isLocalBaseUrl('http://evil.com/127.0.0.1')).toBe(false);
    expect(isLocalBaseUrl('http://evil.com/?host=localhost')).toBe(false);
  });

  it('is not fooled by a port that looks like an address', () => {
    expect(isLocalBaseUrl('http://evil.com:1234/v1')).toBe(false);
  });

  it('handles the IPv6 loopback and IPv4-mapped forms', () => {
    expect(isLocalBaseUrl('http://[::1]:1234/v1')).toBe(true);
    expect(isLocalBaseUrl('http://[::ffff:127.0.0.1]:1234/v1')).toBe(true);
    expect(isLocalBaseUrl('http://[::ffff:192.168.1.5]:1234/v1')).toBe(true);
    expect(isLocalBaseUrl('http://[2001:db8::1]:1234/v1')).toBe(false);
  });

  it('handles the 0.0.0.0 wildcard address', () => {
    expect(isLocalBaseUrl('http://0.0.0.0:1234/v1')).toBe(true);
  });

  it('respects the 172.16/31 private boundary', () => {
    expect(isLocalBaseUrl('http://172.15.0.1:1234/v1')).toBe(false);
    expect(isLocalBaseUrl('http://172.16.0.1:1234/v1')).toBe(true);
    expect(isLocalBaseUrl('http://172.31.255.254:1234/v1')).toBe(true);
    expect(isLocalBaseUrl('http://172.32.0.1:1234/v1')).toBe(false);
  });

  it('treats link-local addresses as local', () => {
    expect(isLocalBaseUrl('http://169.254.10.20:1234/v1')).toBe(true);
    expect(isLocalBaseUrl('http://169.253.10.20:1234/v1')).toBe(false);
  });

  it('follows the browser for alternate numeric spellings of loopback', () => {
    // The URL parser rewrites these to 127.0.0.1, which is where a request
    // would actually go, so they are local.
    expect(isLocalBaseUrl('http://2130706433/v1')).toBe(true);
    expect(isLocalBaseUrl('http://0177.0.0.1/v1')).toBe(true);
    expect(isLocalBaseUrl('http://0x7f.0.0.1/v1')).toBe(true);
  });

  it('treats a trailing dot and an uppercase host as the same local host', () => {
    expect(isLocalBaseUrl('http://localhost.:1234/v1')).toBe(true);
    expect(isLocalBaseUrl('http://LOCALHOST:1234/v1')).toBe(true);
    expect(isLocalBaseUrl('http://LocalHost.:1234/v1')).toBe(true);
  });

  it('rejects a string that is not a URL at all', () => {
    expect(isLocalBaseUrl('localhost:1234')).toBe(false);
    expect(isLocalBaseUrl('://localhost')).toBe(false);
    expect(isLocalBaseUrl('')).toBe(false);
    expect(isLocalBaseUrl('   ')).toBe(false);
  });

  it('never lets a look-alike cloud host through the provider predicate', () => {
    for (const baseUrl of [
      'http://localhost.evil.com/v1',
      'http://127.0.0.1.evil.com/v1',
      'http://192.168.1.1@evil.com/v1',
      'http://evil.com#127.0.0.1',
    ]) {
      expect(isLocalProvider({ providerName: 'openai', baseUrl })).toBe(false);
    }
  });
});
