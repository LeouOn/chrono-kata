'use client';

import { useQuery } from '@tanstack/react-query';
import { domainRepo } from '@/lib/db/domain.repo';
import type { Domain } from '@/lib/schemas/domain';

/** Domain list for capture parsing and labels. Seeded at DB creation. */
export function useDomains(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['domains'],
    queryFn: () => domainRepo.getAll(),
    enabled: options.enabled ?? true,
    select: (domains): Domain[] => domains,
  });
}
