'use client';

import Link from 'next/link';

/**
 * The last-resort boundary: fires when the ROOT LAYOUT itself throws, so it
 * renders its own html/body (Next replaces the whole tree). Same calm copy
 * as the route boundaries; the error still goes to the local log.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (typeof window !== 'undefined') {
    // Recorded inline (no shared component import here on purpose: the fewer
    // modules this file pulls in, the fewer ways it can itself fail).
    try {
      const raw = window.localStorage.getItem('chrono-kata-error-log');
      const existing = raw ? (JSON.parse(raw) as unknown[]) : [];
      const entry = {
        at: Date.now(),
        route: window.location.pathname.split('?')[0],
        name: String(error?.name ?? 'Error').slice(0, 100),
        message: String(error?.message ?? '').slice(0, 200) + (error?.message && error.message.length > 200 ? '…' : ''),
        messageTruncated: Boolean(error?.message && error.message.length > 200),
        stack: String(error?.stack ?? '').slice(0, 2000),
      };
      window.localStorage.setItem(
        'chrono-kata-error-log',
        JSON.stringify([...existing, entry].slice(-50))
      );
    } catch {
      // Private window / quota / corrupt storage: the boundary still renders.
    }
  }

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
              aria-label="Try this screen again"
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
