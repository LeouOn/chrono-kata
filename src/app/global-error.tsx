'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { recordError } from '@/lib/errors/error-log';

/**
 * The last-resort boundary: fires when the ROOT LAYOUT itself throws, so it
 * renders its own html/body (Next replaces the whole tree). Same calm copy
 * as the route boundaries; the error still goes to the local log.
 *
 * Recording happens in an effect keyed on the error, never during render:
 * React may render a component more than once (StrictMode, concurrent
 * re-renders), and one error must be one entry. It uses the shared
 * `recordError` rather than a private copy of the ring buffer so the two can
 * never drift; that module pulls in no UI and is built to never throw, which
 * is what this file needs from a dependency.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    recordError(error, window.location.pathname);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#14171d',
          color: '#e6e1d7',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem', maxWidth: '28rem' }}>
          <p style={{ fontSize: '1.1rem', margin: '0 0 0.5rem' }}>
            Something went wrong on this screen.
          </p>
          <p style={{ fontSize: '0.875rem', opacity: 0.7, margin: '0 0 1.5rem' }}>
            Your data is safe on this device. Nothing was lost.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 44,
                padding: '0 1.25rem',
                borderRadius: 16,
                border: 'none',
                background: '#b3762f',
                color: '#fff',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              aria-label="Go to the Home screen"
              style={{
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0 1rem',
                borderRadius: 16,
                border: '1px solid #3a4049',
                color: '#e6e1d7',
                fontSize: '0.875rem',
                textDecoration: 'none',
              }}
            >
              Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
