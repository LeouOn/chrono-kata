'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { recordError } from '@/lib/errors/error-log';

/**
 * The shared calm error surface (roadmap Wave 20 part 1). Rendered by every
 * error.tsx boundary and by global-error.tsx. No stack trace on screen, no
 * red: say what happened, that the data is safe, and how to move on. The
 * error itself is recorded to the local, on-device log.
 */
export function RouteErrorScreen({
  error,
  reset,
  title = 'Something went wrong on this screen.',
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}) {
  React.useEffect(() => {
    // Pathname at failure time is not knowable here without hooks that can
    // throw; window.location is the honest source and cannot be worse than
    // the error itself.
    recordError(error, typeof window !== 'undefined' ? window.location.pathname : '/');
  }, [error]);

  return (
    <div className="py-8">
      <Card>
        <div className="space-y-4 text-center">
          <p className="font-serif text-lg text-text">{title}</p>
          <p className="text-sm text-text-muted">
            Your data is safe on this device. Nothing was lost.
          </p>
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <Button
              variant="primary"
              className="min-h-11 px-5"
              onClick={reset}
              aria-label="Try this screen again"
            >
              Try again
            </Button>
            <Link
              href="/"
              className="inline-flex items-center rounded-2xl border border-border px-4 min-h-11 text-sm text-text hover:bg-surface-2 transition-colors"
              aria-label="Go to the Home screen"
            >
              Home
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
