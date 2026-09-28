import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LoadResponse } from '@/components/insights/LoadResponse';
import type { CheckIn } from '@/lib/schemas/check-in';
import type { KataTemplate } from '@/lib/schemas/kata-template';
import type { Session } from '@/lib/schemas/session';

afterEach(() => cleanup());

describe('LoadResponse Component', () => {
  it('renders demo data by default when user has no check-ins', () => {
    render(<LoadResponse sessions={[]} checkIns={[]} kataTemplates={[]} />);

    expect(screen.getByText('Load-Response Insights')).toBeInTheDocument();
    expect(screen.getByText(/30-Day Training Load & Next-Day Wellbeing/)).toBeInTheDocument();
    expect(screen.getByText(/Safe Envelope:/)).toBeInTheDocument();
    expect(screen.getByText(/Pacing Discipline \(This Month\)/)).toBeInTheDocument();
    expect(screen.getByText(/Lag Scatter: Load vs. Next-Day Wellbeing/)).toBeInTheDocument();
    expect(screen.getByText(/Spearman:/)).toBeInTheDocument();
    expect(screen.getByText(/Honest caveat:/)).toBeInTheDocument();
  });

  it('allows toggling between Lag 1 and Lag 2', () => {
    render(<LoadResponse sessions={[]} checkIns={[]} kataTemplates={[]} />);

    const lag2Btn = screen.getByRole('button', { name: /Lag 2/i });
    fireEvent.click(lag2Btn);

    expect(screen.getByText('Wellbeing Day N+2')).toBeInTheDocument();
  });

  it('shows empty and insufficient states when switching to empty user data', () => {
    render(<LoadResponse sessions={[]} checkIns={[]} kataTemplates={[]} />);

    // Switch to "My Data"
    const myDataBtn = screen.getByRole('button', { name: /My Data/i });
    fireEvent.click(myDataBtn);

    // Empty state should tell user they need check-ins
    expect(screen.getByText(/Need 14 more check-in days for envelope/)).toBeInTheDocument();
    expect(screen.getByText(/Need at least 2 paired check-in days to plot load response/)).toBeInTheDocument();
    expect(screen.getByText('Explore with Demo Data')).toBeInTheDocument();

    // Clicking "Explore with Demo Data" restores demo mode
    fireEvent.click(screen.getByText('Explore with Demo Data'));
    expect(screen.getByText(/Safe Envelope:/)).toBeInTheDocument();
  });

  it('renders user data when provided with insufficient pairs count', () => {
    const checkIns: CheckIn[] = [
      {
        date: '2026-09-25',
        energy: 4,
        fog: 1,
        aches: 1,
        sleep: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        date: '2026-09-26',
        energy: 4,
        fog: 1,
        aches: 1,
        sleep: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const templates: KataTemplate[] = [
      {
        id: 't1',
        name: 'Forms',
        mode: 'timed',
        intensity: 2,
        icon: '🥋',
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const sessions: Session[] = [
      {
        id: 's1',
        startedAt: new Date(2026, 8, 25, 10, 0),
        durationMinutes: 20,
        rating: 4,
        activityLabel: 'Forms',
        kataTemplateId: 't1',
        stoppedAtCap: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    render(<LoadResponse sessions={sessions} checkIns={checkIns} kataTemplates={templates} />);

    // Since user has check-ins, it defaults to My Data (2)
    expect(screen.getByText('My Data (2)')).toBeInTheDocument();
    expect(screen.getByText(/Need 12 more check-in days for envelope/)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // stoppedAtCapMonthCount is 1
  });

  it('inspects a day on click or hover to show tooltip details', () => {
    render(<LoadResponse sessions={[]} checkIns={[]} kataTemplates={[]} />);

    // Find a rect representing a load bar or hover zone
    const dayTargets = document.querySelectorAll('svg rect');
    expect(dayTargets.length).toBeGreaterThan(10);

    // Click one of the day columns
    fireEvent.click(dayTargets[5]!);

    // Should render inspect details
    expect(screen.getByText(/Next-day wellbeing:/i)).toBeInTheDocument();
  });
});
