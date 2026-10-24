import { useEffect, useRef } from 'react';
import { recordError } from './error-log';

const NOTHING = Symbol('nothing recorded yet');

/**
 * Record an error boundary's error to the local log: once per error.
 *
 * The recording is an effect, never part of render, because React may render
 * a component more than once. An effect alone is not enough in development:
 * StrictMode mounts, unmounts and re-mounts every component, which runs the
 * effect twice for one error. A ref survives that simulated re-mount, so the
 * same error object is skipped the second time. A different error object (the
 * user pressed Try again and the screen failed again) is a new entry.
 *
 * The route is the pathname at failure time, never the query string.
 */
export function useRecordError(error: unknown): void {
  const recorded = useRef<unknown>(NOTHING);
  useEffect(() => {
    if (recorded.current === error) return;
    recorded.current = error;
    recordError(error, window.location.pathname);
  }, [error]);
}
