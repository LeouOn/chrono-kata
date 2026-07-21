import type { Token } from '@/lib/schemas/token';
import { getDb } from './db';

export interface TokensRepository {
  get(): Promise<Token | null>;
  save(token: Token): Promise<void>;
  clear(): Promise<void>;
}

export class DexieTokensRepository implements TokensRepository {
  async get(): Promise<Token | null> {
    const result = await getDb().tokens.get('google');
    return result ?? null;
  }

  async save(token: Token): Promise<void> {
    await getDb().tokens.put(token);
  }

  async clear(): Promise<void> {
    await getDb().tokens.delete('google');
  }
}

export const tokensRepo: TokensRepository = new DexieTokensRepository();
