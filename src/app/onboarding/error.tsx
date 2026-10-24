'use client';

import { RouteErrorScreen } from '@/components/system/RouteErrorScreen';

/** Boundary for onboarding. */
export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorScreen error={error} reset={reset} />;
}
