import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { WeekChart } from '@/components/dashboard/WeekChart';
import type { Session } from '@/lib/schemas/session';

afterEach(() => cleanup());

function makeSession(minutes: number, startedAt: Date): Session {
  return {
    id: crypto.randomUUID(),
    startedAt,
    endedAt: null,
    durationMinutes: minutes,
    reps: null,
    rating: 3,
    activityLabel: undefined,
    note: undefined,
    coachComment: null,
    failedLLM: undefined,
    calendarEventId: null,
    focusRating: null,
    energyRating: null,
    moodRating: null,
    conversationId: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

describe('WeekChart', () => {
  it('labels positive bars with their duration', () => {
    render(<WeekChart sessions={[makeSession(25, new Date())]} />);
    expect(screen.getByText('25m')).toBeInTheDocument();
  });

  it('renders a visible base for every column, including zero-minute days', () => {
    render(<WeekChart sessions={[]} />);
    const columns = document.querySelectorAll('.flex.flex-col.items-center');
    expect(columns.length).toBe(7);
    // Every column has a visible base for zero-days (bg-border, rounded-sm, 2px tall).
    expect(document.querySelectorAll('.bg-border.rounded-sm').length).toBe(7);
  });
});
