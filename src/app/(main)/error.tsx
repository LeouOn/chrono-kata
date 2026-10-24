'use client';

import { RouteErrorScreen } from '@/components/system/RouteErrorScreen';

/** Boundary for everything inside the main app shell. */
export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorScreen error={error} reset={reset} />;
}
