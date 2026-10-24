'use client';

import { RouteErrorScreen } from '@/components/system/RouteErrorScreen';

/**
 * Root-segment error boundary: catches render errors in any route that has
 * no closer boundary, keeping the shell (and every other screen) alive.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorScreen error={error} reset={reset} />;
}
