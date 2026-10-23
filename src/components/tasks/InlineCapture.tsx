'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import { useCaptureTasks, useInbox } from '@/hooks/useTasks';
import { useDomains } from '@/hooks/useDomains';
import { parseCapture, type CaptureDomain } from '@/lib/capture/parse-capture';
import { captureToTaskInput } from '@/lib/capture/task-input';
import type { TaskInput } from '@/lib/schemas/task';

/**
 * Inline capture at the top of the inbox: the fastest path from "I thought of
 * something" to "it is waiting for me", without leaving the list.
 */
export function InlineCapture() {
  const [line, setLine] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { createTask } = useInbox();
  const { data: domains = [] } = useDomains();

  const captureDomains: CaptureDomain[] = useMemo(
    () => domains.map((domain) => ({ id: domain.id, name: domain.name })),
    [domains],
  );
  const parsed = useMemo(
    () => parseCapture(line, { now: new Date(), domains: captureDomains }),
    [line, captureDomains],
  );

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (saving || line.trim() === '') return;
    const input: TaskInput | null = captureToTaskInput(parsed);
    if (!input) return;
    setSaving(true);
    try {
      await createTask(input);
      setLine('');
      toast.show('Added to the inbox.', 'success');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void add(event)} className="flex gap-2">
      <label className="sr-only" htmlFor="inline-capture">
        Add a task
      </label>
      <input
        id="inline-capture"
        value={line}
        onChange={(event) => setLine(event.target.value)}
        placeholder="Add a task… #life ~20m tomorrow @shop"
        autoComplete="off"
        className="flex-1 rounded-xl border border-border bg-surface px-3 py-3 text-sm text-text min-h-11"
      />
      <Button type="submit" disabled={saving || line.trim() === ''}>
        Add
      </Button>
    </form>
  );
}
