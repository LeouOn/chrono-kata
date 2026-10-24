'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProcessMode } from '@/components/tasks/ProcessMode';

/**
 * Step 1 of the review: sort what is still in the inbox. The triage sheet is
 * the same one the inbox screen uses, so the six outcomes, the keyboard
 * shortcuts and the calm copy are not re-implemented here.
 */
export function InboxStep({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <Card>
        <p className="font-serif text-lg text-text">
          {count === 0 ? 'The inbox is clear.' : count === 1 ? 'One item is waiting to be sorted.' : `${count} items are waiting to be sorted.`}
        </p>
        <p className="mt-1 text-sm text-text-muted">
          Sorting happens one item at a time and every decision can be undone. Skipping this step keeps everything
          where it is.
        </p>
      </Card>
      {count > 0 ? <Button onClick={() => setOpen(true)}>Open inbox triage</Button> : null}
      <ProcessMode open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
