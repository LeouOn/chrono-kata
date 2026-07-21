import { describe, it, expect, beforeEach } from 'vitest';
import { isTokenExpired, getValidAccessToken, resetTokenStoreForTesting } from '@/lib/calendar/token-store';
import { tokensRepo } from '@/lib/db/tokens.repo';
import { resetDbForTesting } from '@/lib/db/db';

beforeEach(async () => {
  await resetDbForTesting();
  resetTokenStoreForTesting();
});

describe('isTokenExpired', () => {
  it('returns true if expiry is past', () => {
    expect(isTokenExpired(new Date(Date.now() - 1000))).toBe(true);
  });

  it('returns true if expiry is within 60s (safety buffer)', () => {
    expect(isTokenExpired(new Date(Date.now() + 30_000))).toBe(true);
  });

  it('returns false if expiry is more than 60s away', () => {
    expect(isTokenExpired(new Date(Date.now() + 120_000))).toBe(false);
  });
});

describe('getValidAccessToken', () => {
  it('returns stored token if still valid', async () => {
    await tokensRepo.save({
      id: 'google',
      accessToken: 'valid-token',
      expiresAt: new Date(Date.now() + 600_000),
    });
    const token = await getValidAccessToken();
    expect(token).toBe('valid-token');
  });

  it('returns null if no token stored', async () => {
    const token = await getValidAccessToken();
    expect(token).toBeNull();
  });

  it('returns null if token expired and no refresh logic available', async () => {
    await tokensRepo.save({
      id: 'google',
      accessToken: 'old-token',
      expiresAt: new Date(Date.now() - 1000),
    });
    const token = await getValidAccessToken();
    expect(token).toBeNull();
  });
});
