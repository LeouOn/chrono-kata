'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { useDomains } from '@/hooks/useDomains';
import { useTasks } from '@/hooks/useTasks';
import { useSettings } from '@/hooks/useSettings';
import { useJournalDay } from '@/hooks/useJournal';
import { useTodayKey } from '@/hooks/usePlanning';
import { JournalEntryCard } from './JournalEntryCard';
import { ShutdownCard } from './ShutdownCard';
import { JournalTemplateCard } from './JournalTemplateCard';
import { formatLongDate } from '@/lib/journal/export';
import { addDays, isDayKey } from '@/lib/pacing/days';
import { toLocalDateString } from '@/lib/utils/date';

interface Props {
  /** A local day key from `?date=`, or null for today. */
  dateParam: string | null;
}

/**
 * The journal screen (roadmap Wave 12): today's entry, the evening shutdown and
 * the template. Everything is local-first; nothing here talks to an AI provider,
 * and the journal text is the most private writing in the app.
 */
export function JournalScreen({ dateParam }: Props) {
  const router = useRouter();
  const todayKey = useTodayKey();
  const requested = dateParam && isDayKey(dateParam) ? dateParam : null;
  const dayKey = requested ?? todayKey;

  const { data: plan, isLoading } = useJournalDay(dayKey);
  const { data: tasks = [] } = useTasks();
  const { data: domains = [] } = useDomains();
  const { settings } = useSettings();

  const orderedDomains = useMemo(
    () => [...domains].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [domains],
  );

  function goTo(nextDayKey: string) {
    const isToday = nextDayKey === toLocalDateString(new Date());
    router.push(isToday ? '/journal' : `/journal?date=${nextDayKey}`);
  }

  return (
    <div className="space-y-5" data-testid="journal-screen">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl text-text">Journal</h1>
        <p className="text-sm text-text-muted">{formatLongDate(dayKey)}</p>
        <nav className="flex flex-wrap items-center gap-2 pt-1" aria-label="Journal day">
          <button
            type="button"
            onClick={() => goTo(addDays(dayKey, -1))}
            className="min-h-11 rounded-2xl border border-border bg-surface px-3 text-sm text-text"
          >
            Previous day
          </button>
          <button
            type="button"
            onClick={() => goTo(todayKey)}
            className="min-h-11 rounded-2xl border border-border bg-surface px-3 text-sm text-text"
            aria-current={dayKey === todayKey ? 'date' : undefined}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => goTo(addDays(dayKey, 1))}
            className="min-h-11 rounded-2xl border border-border bg-surface px-3 text-sm text-text"
          >
            Next day
          </button>
          <Link href="/" className="min-h-11 rounded-2xl px-3 text-sm text-text-muted hover:text-text">
            Home
          </Link>
        </nav>
      </header>

      {isLoading ? (
        <p role="status" className="text-sm text-text-muted">
          Opening the day…
        </p>
      ) : (
        <Card>
          <JournalEntryCard
            dayKey={dayKey}
            plan={plan ?? null}
            domains={orderedDomains}
            savedTemplate={settings?.journalTemplate}
          />
        </Card>
      )}

      <Card>
        <ShutdownCard
          dayKey={dayKey}
          plan={plan ?? null}
          tasks={tasks}
          domains={orderedDomains}
          domainChecks={plan?.domainChecks ?? {}}
        />
      </Card>

      <Card>
        <JournalTemplateCard />
      </Card>
    </div>
  );
}
