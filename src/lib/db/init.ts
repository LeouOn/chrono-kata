import { getDb } from './db';
import { seedDefaultDomains } from './seed-domains';

/**
 * App-init belt-and-braces: the fresh-install domain seed normally rides on
 * Dexie's `populate` event, which fires exactly once at database creation.
 * If that seed ever fails silently, no populate will run again — so the app
 * layout calls this once per mount. `seedDefaultDomains` is count-guarded
 * and idempotent, making this a no-op in the normal case.
 */
export async function ensureDefaultDomains(): Promise<void> {
  const db = getDb();
  await db.open();
  await seedDefaultDomains(db.domains);
}
