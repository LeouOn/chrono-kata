'use client';

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useInbox } from '@/hooks/useTasks';
import { ProcessMode } from './ProcessMode';
import { InlineCapture } from './InlineCapture';
import { useSessionLauncher } from '@/components/session/SessionLauncher';
import { toLocalDateString } from '@/lib/utils/date';

/**
 * The inbox: everything with status `inbox`, newest first, with a neutral
 * count. No red, no overdue language - an unsorted item is simply resting.
 */
export function InboxScreen() {
  const { inbox, count, isLoading } = useInbox();
  const [processing, setProcessing] = useState(false);
  const processButtonRef = useRef<HTMLButtonElement>(null);
  const sessionLauncher = useSessionLauncher();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-text mb-1">Inbox</h1>
          <p className="text-text-muted text-sm">
            {count === 0
              ? 'Nothing to sort.'
              : count === 1
                ? '1 item to sort, whenever you want.'
                : `${count} items to sort, whenever you want.`}
          </p>
        </div>
        <Button
          ref={processButtonRef}
          onClick={() => setProcessing(true)}
          disabled={count === 0}
        >
          Process
        </Button>
      </div>

      <InlineCapture />

      {isLoading ? <p className="text-sm text-text-muted">Loading…</p> : null}

      {!isLoading && count === 0 ? (
        <Card>
          <p className="font-serif text-lg text-text">Inbox is clear.</p>
          <p className="text-sm text-text-muted mt-1">
            Captured items will wait here until you have a minute.
          </p>
        </Card>
      ) : null}

      <ul className="space-y-2">
        {inbox.map((task) => (
          <li key={task.id}>
            <Card className="space-y-1">
              <p className="text-text break-words">{task.title}</p>
              {task.nextAction ? (
                <p className="text-xs text-text-muted">
                  Pick up here: <span className="text-text">{task.nextAction}</span>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
                <span>added {toLocalDateString(task.createdAt)}</span>
                {task.estimateMin ? <span>~{task.estimateMin}m</span> : null}
                {task.actualMin ? <span>{task.actualMin}m logged</span> : null}
                {task.energy ? <span>{task.energy} energy</span> : null}
                {(task.context ?? []).map((context) => (
                  <span key={context}>@{context}</span>
                ))}
              </div>
              <div className="pt-1">
                <Button
                  variant="ghost"
                  className="min-h-11 px-3 text-sm"
                  aria-label={`Start a session for ${task.title}`}
                  onClick={() =>
                    sessionLauncher.openForLink({
                      taskId: task.id,
                      label: (task.nextAction || task.title).slice(0, 50),
                      estimateMin: task.estimateMin ?? null,
                    })
                  }
                >
                  Start
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <ProcessMode
        open={processing}
        onClose={() => {
          setProcessing(false);
          // The Modal's own focus restore can be defeated when the focused
          // input unmounts, so put focus back on the opener explicitly.
          window.setTimeout(() => processButtonRef.current?.focus(), 0);
        }}
      />
    </div>
  );
}
