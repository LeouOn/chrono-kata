'use client';

import { useQuery } from '@tanstack/react-query';
import { domainRepo } from '@/lib/db/domain.repo';
import type { Domain } from '@/lib/schemas/domain';

/** Domain list for capture parsing and labels. Seeded at DB creation. */
export function useDomains() {
  return useQuery({
    queryKey: ['domains'],
    queryFn: () => domainRepo.getAll(),
    select: (domains): Domain[] => domains,
  });
}
