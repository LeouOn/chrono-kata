'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { runDecomposition, calmErrorCopy, type DecompositionCallResult } from '@/lib/decomposition/service';
import type { DecompositionTaskInput } from '@/lib/decomposition/prompt';
import type { DecompositionMode } from '@/lib/decomposition/schema';

export type DecomposePhase =
  | { kind: 'idle' }
  | { kind: 'error'; message: string; retryable: boolean };

export interface DecomposeRunState {
  phase: 'privacy' | 'running' | 'done';
  mode: DecompositionMode;
  input: DecompositionTaskInput;
  taskId: string;
  result: DecompositionCallResult | null;
}

/**
 * Drives one decomposition: privacy panel → call → result. The in-flight
 * guard and the abort controller live in refs (not state), so a double click
 * in one act() cannot start two calls and an unmount aborts cleanly.
 */
export function useDecomposition() {
  const [run, setRun] = useState<DecomposeRunState>({ phase: 'privacy', mode: 'break-it-down', input: { title: '' }, taskId: '', result: null });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<DecomposePhase>({ kind: 'idle' });

  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const start = useCallback(
    (input: DecompositionTaskInput, mode: DecompositionMode, taskId: string) => {
      setError({ kind: 'idle' });
      setRun({ phase: 'privacy', mode, input, taskId, result: null });
      setOpen(true);
    },
    []
  );

  const send = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setRun((r) => (r.phase === 'privacy' ? { ...r, phase: 'running' } : r));
    try {
      const result = await runDecomposition(run.mode, run.input, { signal: controller.signal });
      if (!mountedRef.current) return;
      setRun((r) => ({ ...r, phase: 'done', result }));
    } catch (e) {
      if (!mountedRef.current) return;
      // Closed (or unmounted) while in flight: no error UI for a call the
      // user cancelled — whatever shape the rejection takes.
      if (controller.signal.aborted) return;
      setError({ kind: 'error', message: calmErrorCopy(e, 'The provider'), retryable: true });
      setRun((r) => (r.phase === 'running' ? { ...r, phase: 'privacy' } : r));
    } finally {
      inFlightRef.current = false;
    }
  }, [run.mode, run.input]);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setOpen(false);
    setError({ kind: 'idle' });
  }, []);

  return { open, run, error, start, send, close, inFlightRef };
}

/** Invalidate everything that shows tasks after an apply. */
export function useInvalidateTasks(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['plan'] });
  };
}
