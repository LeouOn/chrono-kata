import { DomainSchema, type Domain } from '@/lib/schemas/domain';

/**
 * Fixed ids so repeat seeds (fresh install vs v6→v7 upgrade) and
 * export/import round-trips never duplicate the default domains.
 */
export const DOMAIN_SEED_IDS = {
  trading: '11111111-1111-4111-8111-111111111111',
  practice: '11111111-1111-4111-8111-111111111112',
  career: '11111111-1111-4111-8111-111111111113',
  lifeAdmin: '11111111-1111-4111-8111-111111111114',
} as const;

export const DEFAULT_DOMAINS: Domain[] = [
  {
    id: DOMAIN_SEED_IDS.trading,
    name: 'Trading',
    color: '#4a90d9',
    icon: '📈',
    order: 0,
    createdAt: new Date('2026-10-23T00:00:00Z'),
    updatedAt: new Date('2026-10-23T00:00:00Z'),
  },
  {
    id: DOMAIN_SEED_IDS.practice,
    name: 'Practice',
    color: '#7aa874',
    icon: '🥋',
    order: 1,
    createdAt: new Date('2026-10-23T00:00:00Z'),
    updatedAt: new Date('2026-10-23T00:00:00Z'),
  },
  {
    id: DOMAIN_SEED_IDS.career,
    name: 'Career/Build',
    color: '#c9a227',
    icon: '🛠️',
    order: 2,
    createdAt: new Date('2026-10-23T00:00:00Z'),
    updatedAt: new Date('2026-10-23T00:00:00Z'),
  },
  {
    id: DOMAIN_SEED_IDS.lifeAdmin,
    name: 'Life admin',
    color: '#9b8bb4',
    icon: '🧾',
    order: 3,
    createdAt: new Date('2026-10-23T00:00:00Z'),
    updatedAt: new Date('2026-10-23T00:00:00Z'),
  },
];

/**
 * Seed the four default domains if the table is empty. Safe to call from
 * both the fresh-install populate path and the v6→v7 upgrade: it inserts
 * nothing when any domain row already exists.
 */
export async function seedDefaultDomains(
  table: { count(): Promise<number>; bulkPut(rows: Domain[]): Promise<unknown> },
): Promise<void> {
  if ((await table.count()) > 0) return;
  await table.bulkPut(DEFAULT_DOMAINS.map((d) => DomainSchema.parse(d)));
}
