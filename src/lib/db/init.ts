import { getDb } from './db';
import { seedDefaultDomains } from './seed-domains';

/**
 * App-init belt-and-braces: the fresh-install domain seed normally rides on
 * Dexie's `populate` event, which fires exactly once at database creation.
 * If that seed ever fails silently, no populate will run again — so the app
 * layout calls this once per mount. `seedDefaultDomains` is count-guarded
 * and idempotent, making this a no-op in the normal case.
 *
 * Never rejects: the heal is a convenience, not a reason to break the app.
 * Callers use a bare `void`, so an escaping rejection would be unhandled
 * (same class as the populate-seed bug fixed in PR #18).
 */
export async function ensureDefaultDomains(): Promise<void> {
  try {
    const db = getDb();
    await db.open();
    await seedDefaultDomains(db.domains);
  } catch (error) {
    console.warn('ensureDefaultDomains failed; retrying on next app start', error);
  }
}
