# chrono-kata Wave 6: Insights + Data Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Ship the two highest-value deferred features. (1) Insights view: year-in-pixels heatmap, activity breakdown, rating trends, reflection generation folded into one analytics destination. (2) Data Export/Import: JSON backup with one-tap restore — mandatory for a local-first app.

**Architecture:** New `/insights` route added as 6th tab. Pure functions for aggregations in `lib/insights/`. Export/import utilities in `lib/data-transfer/` produce and consume a versioned JSON envelope. No new deps.

**Tech Stack:** Same as Waves 1–5. No new deps.

## Global Constraints

- **OS:** Windows PowerShell 5.1.
- **Project root:** `C:\Users\llama\OneDrive\proj\chrono-kata`
- **TypeScript strict:** No `as any`, no `@ts-ignore`.
- **Mobile-first:** Heatmap must render readably on 375px-wide screens.
- **Tab bar:** Now 6 tabs (Home, Sessions, Reflect, Insights, LLM, Settings).
- **Export format:** `{ version: 1, exportedAt, sessions, reflections, streak, settings, llmSettings }` — single JSON file.
- **Import behavior:** Confirm dialog warning about overwrite. Replaces ALL local data. No merge logic (v1 — keep simple).
- **Commit message style:** `feat:`/`fix:`/`chore:` prefix.
- **`motion/react`** for motion.

---

## File Structure (Wave 6 additions)

```
src/
├── lib/
│   ├── insights/
│   │   ├── heatmap.ts                        # NEW — buildHeatmapData(sessions, year)
│   │   ├── breakdown.ts                      # NEW — time/reps by activity label
│   │   └── trends.ts                         # NEW — rolling rating averages
│   └── data-transfer/
│       ├── export.ts                         # NEW — collectAll() → JSON envelope
│       └── import.ts                         # NEW — replaceAll(envelope) with wipe + restore
├── components/
│   ├── insights/
│   │   ├── Heatmap.tsx                       # NEW — year-in-pixels grid
│   │   ├── ActivityBreakdown.tsx             # NEW — top activities with time/reps
│   │   └── RatingTrends.tsx                  # NEW — 30-day rolling avg line
│   └── settings/
│       └── DataTransfer.tsx                  # NEW — export/import buttons + confirm
├── app/(main)/
│   └── insights/
│       └── page.tsx                          # NEW — Insights tab
├── components/ui/
│   └── TabBar.tsx                            # MODIFY — add Insights tab
tests/
└── unit/
    ├── insights/
    │   ├── heatmap.test.ts                   # NEW
    │   ├── breakdown.test.ts                 # NEW
    │   └── trends.test.ts                    # NEW
    └── data-transfer/
        ├── export.test.ts                    # NEW
        └── import.test.ts                    # NEW
```

---

## Task 1: Insights aggregation functions (TDD)

**Files:**
- Create: `src/lib/insights/heatmap.ts`, `breakdown.ts`, `trends.ts`
- Test: `tests/unit/insights/heatmap.test.ts`, `breakdown.test.ts`, `trends.test.ts`

- [ ] **Step 1: Heatmap test**

Create `tests/unit/insights/heatmap.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildHeatmapData } from '@/lib/insights/heatmap';
import type { Session } from '@/lib/schemas/session';

const ses = (date: string, minutes = 30): Session => ({
  id: crypto.randomUUID(),
  startedAt: new Date(date),
  durationMinutes: minutes,
  reps: null,
  rating: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Session);

describe('buildHeatmapData', () => {
  it('returns 365/366 entries for a full year', () => {
    const data = buildHeatmapData([], 2026);
    // 2026 is not a leap year (2024 was) — 365 days
    expect(data.cells.length).toBe(365);
  });

  it('handles leap years (2024)', () => {
    const data = buildHeatmapData([], 2024);
    expect(data.cells.length).toBe(366);
  });

  it('aggregates minutes per day across multiple sessions', () => {
    const sessions = [
      ses('2026-03-15T10:00:00Z', 30),
      ses('2026-03-15T14:00:00Z', 45),
      ses('2026-03-16T10:00:00Z', 20),
    ];
    const data = buildHeatmapData(sessions, 2026);
    const mar15 = data.cells.find((c) => c.date === '2026-03-15');
    const mar16 = data.cells.find((c) => c.date === '2026-03-16');
    const mar17 = data.cells.find((c) => c.date === '2026-03-17');
    expect(mar15?.totalMinutes).toBe(75);
    expect(mar15?.sessionCount).toBe(2);
    expect(mar16?.totalMinutes).toBe(20);
    expect(mar16?.sessionCount).toBe(1);
    expect(mar17?.totalMinutes).toBe(0);
    expect(mar17?.sessionCount).toBe(0);
  });

  it('computes intensity level (0-4) based on max minutes in year', () => {
    const sessions = [
      ses('2026-03-15T10:00:00Z', 30),
      ses('2026-03-16T10:00:00Z', 120),
    ];
    const data = buildHeatmapData(sessions, 2026);
    const mar15 = data.cells.find((c) => c.date === '2026-03-15')!;
    const mar16 = data.cells.find((c) => c.date === '2026-03-16')!;
    const empty = data.cells.find((c) => c.date === '2026-03-17')!;
    expect(empty.intensity).toBe(0);
    expect(mar16.intensity).toBe(4); // max
    expect(mar15.intensity).toBeGreaterThan(0).and.toBeLessThan(4);
  });

  it('cells use local YYYY-MM-DD', () => {
    const sessions = [ses('2026-03-15T10:00:00Z')];
    const data = buildHeatmapData(sessions, 2026);
    // The local date string is what matters, not the UTC interpretation
    expect(data.cells.some((c) => c.sessionCount === 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement heatmap**

Create `src/lib/insights/heatmap.ts`:

```typescript
import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';

export interface HeatmapCell {
  date: string; // YYYY-MM-DD
  totalMinutes: number;
  sessionCount: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface HeatmapData {
  cells: HeatmapCell[];
  maxMinutes: number;
}

/**
 * Build year-in-pixels data. Returns one cell per day of the given year,
 * ordered January 1 → December 31. Days with no sessions have intensity 0.
 */
export function buildHeatmapData(sessions: Session[], year: number): HeatmapData {
  // Bucket sessions by local date string.
  const byDay = new Map<string, { minutes: number; count: number }>();
  for (const s of sessions) {
    const key = toLocalDateString(s.startedAt);
    const existing = byDay.get(key);
    if (existing) {
      existing.minutes += s.durationMinutes ?? 0;
      existing.count += 1;
    } else {
      byDay.set(key, { minutes: s.durationMinutes ?? 0, count: 1 });
    }
  }

  // Build full-year list.
  const cells: HeatmapCell[] = [];
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;
  const start = new Date(year, 0, 1);
  let maxMinutes = 0;

  for (let i = 0; i < daysInYear; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = toLocalDateString(d);
    const entry = byDay.get(key);
    const totalMinutes = entry?.minutes ?? 0;
    const sessionCount = entry?.count ?? 0;
    if (totalMinutes > maxMinutes) maxMinutes = totalMinutes;
    cells.push({ date: key, totalMinutes, sessionCount, intensity: 0 });
  }

  // Assign intensity 0-4 based on max minutes in year.
  for (const c of cells) {
    if (c.totalMinutes === 0 || maxMinutes === 0) {
      c.intensity = 0;
    } else {
      const ratio = c.totalMinutes / maxMinutes;
      c.intensity = ratio >= 0.75 ? 4 : ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
    }
  }

  return { cells, maxMinutes };
}
```

- [ ] **Step 3: Breakdown test + impl**

Create `tests/unit/insights/breakdown.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildActivityBreakdown } from '@/lib/insights/breakdown';
import type { Session } from '@/lib/schemas/session';

const ses = (overrides: Partial<Session>): Session => ({
  id: crypto.randomUUID(),
  startedAt: new Date('2026-07-21T10:00:00Z'),
  rating: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as Session);

describe('buildActivityBreakdown', () => {
  it('groups sessions by activityLabel, sums minutes + reps + counts', () => {
    const sessions = [
      ses({ durationMinutes: 30, reps: null, activityLabel: 'meditation' }),
      ses({ durationMinutes: 20, reps: null, activityLabel: 'meditation' }),
      ses({ durationMinutes: null, reps: 108, activityLabel: 'mantras' }),
      ses({ durationMinutes: null, reps: 50, activityLabel: 'push-ups' }),
    ];
    const result = buildActivityBreakdown(sessions);
    expect(result).toHaveLength(3);
    const med = result.find((r) => r.label === 'meditation')!;
    expect(med.totalMinutes).toBe(50);
    expect(med.totalReps).toBe(0);
    expect(med.sessionCount).toBe(2);
  });

  it('groups unlabeled sessions under "(unlabeled)"', () => {
    const sessions = [
      ses({ durationMinutes: 30, reps: null }),
      ses({ durationMinutes: 20, reps: null, activityLabel: 'meditation' }),
    ];
    const result = buildActivityBreakdown(sessions);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.label === '(unlabeled)')!.sessionCount).toBe(1);
  });

  it('sorts by total time desc (minutes-first, then reps)', () => {
    const sessions = [
      ses({ durationMinutes: 60, reps: null, activityLabel: 'a' }),
      ses({ durationMinutes: null, reps: 1000, activityLabel: 'b' }),
      ses({ durationMinutes: 30, reps: null, activityLabel: 'c' }),
    ];
    const result = buildActivityBreakdown(sessions);
    expect(result[0]!.label).toBe('a'); // 60m
    expect(result[1]!.label).toBe('c'); // 30m
    expect(result[2]!.label).toBe('b'); // reps sort after timed
  });

  it('returns empty array for no sessions', () => {
    expect(buildActivityBreakdown([])).toEqual([]);
  });
});
```

Create `src/lib/insights/breakdown.ts`:

```typescript
import type { Session } from '@/lib/schemas/session';

export interface ActivityBreakdownEntry {
  label: string;
  totalMinutes: number;
  totalReps: number;
  sessionCount: number;
  averageRating: number;
}

export function buildActivityBreakdown(sessions: Session[]): ActivityBreakdownEntry[] {
  const map = new Map<string, { minutes: number; reps: number; count: number; ratingSum: number }>();
  for (const s of sessions) {
    const label = s.activityLabel ?? '(unlabeled)';
    const entry = map.get(label);
    if (entry) {
      entry.minutes += s.durationMinutes ?? 0;
      entry.reps += s.reps ?? 0;
      entry.count += 1;
      entry.ratingSum += s.rating;
    } else {
      map.set(label, {
        minutes: s.durationMinutes ?? 0,
        reps: s.reps ?? 0,
        count: 1,
        ratingSum: s.rating,
      });
    }
  }

  const entries: ActivityBreakdownEntry[] = Array.from(map.entries()).map(([label, e]) => ({
    label,
    totalMinutes: e.minutes,
    totalReps: e.reps,
    sessionCount: e.count,
    averageRating: e.ratingSum / e.count,
  }));

  // Timed activities first (by minutes desc), then reps-only (by reps desc).
  entries.sort((a, b) => {
    if (a.totalMinutes > 0 || b.totalMinutes > 0) {
      return b.totalMinutes - a.totalMinutes;
    }
    return b.totalReps - a.totalReps;
  });

  return entries;
}
```

- [ ] **Step 4: Trends test + impl**

Create `tests/unit/insights/trends.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildRatingTrend } from '@/lib/insights/trends';
import type { Session } from '@/lib/schemas/session';

const ses = (date: string, rating: number): Session => ({
  id: crypto.randomUUID(),
  startedAt: new Date(date),
  durationMinutes: 30,
  reps: null,
  rating,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Session);

describe('buildRatingTrend', () => {
  it('returns 30 days of data with rolling averages', () => {
    const sessions = [
      ses('2026-07-21T10:00:00Z', 5),
      ses('2026-07-20T10:00:00Z', 3),
      ses('2026-07-19T10:00:00Z', 4),
    ];
    const result = buildRatingTrend(sessions, new Date('2026-07-21T23:59:59Z'));
    expect(result).toHaveLength(30);
    const today = result[29]!;
    expect(today.averageRating).toBe(5);
    expect(today.sessionCount).toBe(1);
  });

  it('returns null averageRating for days with no sessions', () => {
    const result = buildRatingTrend([], new Date('2026-07-21T23:59:59Z'));
    expect(result).toHaveLength(30);
    expect(result[29]!.averageRating).toBeNull();
  });

  it('averages multiple sessions same day', () => {
    const sessions = [
      ses('2026-07-21T10:00:00Z', 4),
      ses('2026-07-21T14:00:00Z', 2),
    ];
    const result = buildRatingTrend(sessions, new Date('2026-07-21T23:59:59Z'));
    expect(result[29]!.averageRating).toBe(3);
    expect(result[29]!.sessionCount).toBe(2);
  });
});
```

Create `src/lib/insights/trends.ts`:

```typescript
import type { Session } from '@/lib/schemas/session';
import { toLocalDateString } from '@/lib/utils/date';

export interface RatingTrendDay {
  date: string; // YYYY-MM-DD
  averageRating: number | null;
  sessionCount: number;
}

/**
 * Returns 30 days of rating data ending at `endDate`. Each entry shows the
 * average rating for that day, or null if no sessions.
 */
export function buildRatingTrend(sessions: Session[], endDate: Date): RatingTrendDay[] {
  const byDay = new Map<string, { sum: number; count: number }>();
  for (const s of sessions) {
    const key = toLocalDateString(s.startedAt);
    const entry = byDay.get(key);
    if (entry) {
      entry.sum += s.rating;
      entry.count += 1;
    } else {
      byDay.set(key, { sum: s.rating, count: 1 });
    }
  }

  const days: RatingTrendDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const key = toLocalDateString(d);
    const entry = byDay.get(key);
    days.push({
      date: key,
      averageRating: entry ? entry.sum / entry.count : null,
      sessionCount: entry?.count ?? 0,
    });
  }
  return days;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- insights/`
Expected: 12 tests pass (5 heatmap + 4 breakdown + 3 trends).

- [ ] **Step 6: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: insights aggregations - heatmap, breakdown, trends with tests" }
```

---

## Task 2: Heatmap, ActivityBreakdown, RatingTrends components

**Files:**
- Create: `src/components/insights/Heatmap.tsx`, `ActivityBreakdown.tsx`, `RatingTrends.tsx`

- [ ] **Step 1: Heatmap component**

Create `src/components/insights/Heatmap.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { buildHeatmapData, type HeatmapCell } from '@/lib/insights/heatmap';
import type { Session } from '@/lib/schemas/session';
import { formatDuration } from '@/lib/utils/format';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const INTENSITY_COLORS = [
  'bg-surface-2',
  'bg-accent/30',
  'bg-accent/50',
  'bg-accent/70',
  'bg-accent',
];

interface Props {
  sessions: Session[];
}

export function Heatmap({ sessions }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const data = useMemo(() => buildHeatmapData(sessions, year), [sessions, year]);
  const [hovered, setHovered] = useState<HeatmapCell | null>(null);

  // Group cells by month for column headers.
  const monthGroups = useMemo(() => {
    const groups: HeatmapCell[][] = [];
    let currentMonth = -1;
    for (const cell of data.cells) {
      const m = Number(cell.date.slice(5, 7)) - 1;
      if (m !== currentMonth) {
        groups.push([]);
        currentMonth = m;
      }
      groups[groups.length - 1]!.push(cell);
    }
    return groups;
  }, [data]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Heatmap</div>
          <div className="font-serif text-lg text-text">{year}</div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="text-text-muted hover:text-text px-2"
            aria-label="Previous year"
          >‹</button>
          <button
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= currentYear}
            className="text-text-muted hover:text-text px-2 disabled:opacity-30"
            aria-label="Next year"
          >›</button>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-[3px] min-w-max">
          {monthGroups.map((cells, monthIdx) => (
            <div key={monthIdx} className="flex flex-col gap-[3px]">
              <div className="text-[10px] text-text-muted h-3">{MONTH_LABELS[Number(cells[0]!.date.slice(5, 7)) - 1]}</div>
              {cells.map((cell) => (
                <div
                  key={cell.date}
                  className={`w-[10px] h-[10px] rounded-sm ${INTENSITY_COLORS[cell.intensity]} ${cell.sessionCount > 0 ? 'cursor-pointer' : ''}`}
                  onMouseEnter={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                  title={`${cell.date}: ${cell.sessionCount} session${cell.sessionCount === 1 ? '' : 's'}, ${formatDuration(cell.totalMinutes)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-text-muted">
        <div>
          {hovered ? (
            <span>{hovered.date} · {hovered.sessionCount} session{hovered.sessionCount === 1 ? '' : 's'} · {formatDuration(hovered.totalMinutes)}</span>
          ) : (
            <span>Hover a day for details</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span>Less</span>
          {INTENSITY_COLORS.map((c, i) => (
            <div key={i} className={`w-[10px] h-[10px] rounded-sm ${c}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: ActivityBreakdown component**

Create `src/components/insights/ActivityBreakdown.tsx`:

```tsx
import { Card } from '@/components/ui/Card';
import { buildActivityBreakdown } from '@/lib/insights/breakdown';
import { formatDuration } from '@/lib/utils/format';
import type { Session } from '@/lib/schemas/session';

interface Props {
  sessions: Session[];
}

export function ActivityBreakdown({ sessions }: Props) {
  const entries = buildActivityBreakdown(sessions);
  const maxMinutes = Math.max(1, ...entries.map((e) => e.totalMinutes));

  if (entries.length === 0) {
    return (
      <Card>
        <div className="text-xs uppercase tracking-wide text-text-muted mb-2">Activities</div>
        <p className="text-text-muted text-sm">No sessions yet.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">Activities</div>
      <div className="space-y-2">
        {entries.slice(0, 10).map((e) => (
          <div key={e.label}>
            <div className="flex items-baseline justify-between text-sm mb-1">
              <span className="text-text truncate">{e.label}</span>
              <span className="text-text-muted text-xs ml-2 shrink-0">
                {e.totalMinutes > 0 ? formatDuration(e.totalMinutes) : `${e.totalReps} reps`}
                {' · '}
                {e.sessionCount} session{e.sessionCount === 1 ? '' : 's'}
                {' · '}
                avg {e.averageRating.toFixed(1)}/5
              </span>
            </div>
            {e.totalMinutes > 0 && (
              <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{ width: `${(e.totalMinutes / maxMinutes) * 100}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: RatingTrends component**

Create `src/components/insights/RatingTrends.tsx`:

```tsx
import { Card } from '@/components/ui/Card';
import { buildRatingTrend } from '@/lib/insights/trends';
import type { Session } from '@/lib/schemas/session';

interface Props {
  sessions: Session[];
}

export function RatingTrends({ sessions }: Props) {
  const days = buildRatingTrend(sessions, new Date());
  const width = 300;
  const height = 80;
  const padding = 8;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Build polyline points. Skip nulls.
  const points: Array<{ x: number; y: number; rating: number }> = [];
  days.forEach((d, i) => {
    if (d.averageRating != null) {
      const x = padding + (i / (days.length - 1)) * chartWidth;
      const y = padding + (1 - (d.averageRating - 1) / 4) * chartHeight;
      points.push({ x, y, rating: d.averageRating });
    }
  });

  const path = points.length > 0
    ? `M ${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`
    : '';

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-2">Rating trend (30 days)</div>
      {points.length === 0 ? (
        <p className="text-text-muted text-sm py-8 text-center">No rated sessions in the last 30 days.</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines for ratings 1, 3, 5 */}
          {[1, 3, 5].map((r) => {
            const y = padding + (1 - (r - 1) / 4) * chartHeight;
            return (
              <g key={r}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="2 2" />
                <text x={padding - 2} y={y + 3} textAnchor="end" fontSize="9" fill="var(--color-text-muted)">{r}</text>
              </g>
            );
          })}
          {/* Trend line */}
          <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {/* Points */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--color-accent)" />
          ))}
        </svg>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: Heatmap, ActivityBreakdown, RatingTrends components" }
```

---

## Task 3: Add Insights tab + page

**Files:**
- Modify: `src/components/ui/TabBar.tsx` (add 6th tab)
- Create: `src/app/(main)/insights/page.tsx`

- [ ] **Step 1: Update TabBar to 6 tabs**

Modify `src/components/ui/TabBar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListTodo, Sparkles, BarChart3, Cpu, Settings as SettingsIcon } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/sessions', label: 'Sessions', icon: ListTodo },
  { href: '/reflect', label: 'Reflect', icon: Sparkles },
  { href: '/insights', label: 'Insights', icon: BarChart3 },
  { href: '/llm', label: 'LLM', icon: Cpu },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-base/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-6 max-w-md mx-auto">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center py-2 gap-1 text-[10px] transition-colors ${
                active ? 'text-accent' : 'text-text-muted'
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Insights page**

Create `src/app/(main)/insights/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Heatmap } from '@/components/insights/Heatmap';
import { ActivityBreakdown } from '@/components/insights/ActivityBreakdown';
import { RatingTrends } from '@/components/insights/RatingTrends';
import { Card } from '@/components/ui/Card';
import { sessionRepo } from '@/lib/db/session.repo';
import { formatDuration } from '@/lib/utils/format';

export default function InsightsPage() {
  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionRepo.getAll(),
  });

  const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
  const totalReps = sessions.reduce((sum, s) => sum + (s.reps ?? 0), 0);
  const avgRating = sessions.length > 0
    ? (sessions.reduce((sum, s) => sum + s.rating, 0) / sessions.length).toFixed(2)
    : '—';

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Insights</h1>

      <Card>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-text-muted">All-time time</div>
            <div className="font-serif text-xl text-text">{formatDuration(totalMinutes)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-text-muted">All-time reps</div>
            <div className="font-serif text-xl text-text">{totalReps}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-text-muted">Sessions</div>
            <div className="font-serif text-xl text-text">{sessions.length}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-text-muted">Avg rating</div>
            <div className="font-serif text-xl text-text">{avgRating}</div>
          </div>
        </div>
      </Card>

      <Heatmap sessions={sessions} />
      <RatingTrends sessions={sessions} />
      <ActivityBreakdown sessions={sessions} />
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: insights tab with heatmap, trends, breakdown" }
```

---

## Task 4: Data export utility (TDD)

**Files:**
- Create: `src/lib/data-transfer/export.ts`, `src/lib/data-transfer/types.ts`
- Test: `tests/unit/data-transfer/export.test.ts`

- [ ] **Step 1: Types**

Create `src/lib/data-transfer/types.ts`:

```typescript
import type { Session } from '@/lib/schemas/session';
import type { Reflection } from '@/lib/schemas/reflection';
import type { Streak } from '@/lib/schemas/streak';
import type { Settings } from '@/lib/schemas/settings';
import type { LLMSettings } from '@/lib/schemas/llm-settings';

export interface ExportEnvelope {
  version: 1;
  exportedAt: string; // ISO
  sessions: Session[];
  reflections: Reflection[];
  streak: Streak | null;
  settings: Settings | null;
  llmSettings: LLMSettings | null;
}
```

- [ ] **Step 2: Export test**

Create `tests/unit/data-transfer/export.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { collectAll } from '@/lib/data-transfer/export';
import { resetDbForTesting } from '@/lib/db/db';
import { sessionRepo } from '@/lib/db/session.repo';

beforeEach(() => {
  resetDbForTesting();
});

describe('collectAll', () => {
  it('returns an envelope with version 1 and ISO exportedAt', async () => {
    const env = await collectAll();
    expect(env.version).toBe(1);
    expect(typeof env.exportedAt).toBe('string');
    expect(() => new Date(env.exportedAt)).not.toThrow();
  });

  it('includes all sessions', async () => {
    await sessionRepo.save({
      startedAt: new Date(),
      endedAt: null,
      durationMinutes: 30,
      reps: null,
      rating: 4,
    });
    const env = await collectAll();
    expect(env.sessions).toHaveLength(1);
  });

  it('includes settings (singleton)', async () => {
    const env = await collectAll();
    expect(env.settings).not.toBeNull();
    expect(env.settings?.id).toBe('singleton');
  });

  it('includes streak (singleton)', async () => {
    const env = await collectAll();
    expect(env.streak).not.toBeNull();
  });

  it('includes llmSettings (singleton)', async () => {
    const env = await collectAll();
    expect(env.llmSettings).not.toBeNull();
  });

  it('omits API keys from llmSettings for safe export', async () => {
    const env = await collectAll();
    // llmSettings.providers values should have apiKey stripped (safe export)
    for (const entry of Object.values(env.llmSettings?.providers ?? {})) {
      expect(entry.apiKey).toBe('');
    }
  });
});
```

- [ ] **Step 3: Implement export**

Create `src/lib/data-transfer/export.ts`:

```typescript
import { sessionRepo } from '@/lib/db/session.repo';
import { reflectionRepo } from '@/lib/db/reflection.repo';
import { streakRepo } from '@/lib/db/streak.repo';
import { settingsRepo } from '@/lib/db/settings.repo';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import { getDb } from '@/lib/db/db';
import type { ExportEnvelope } from './types';

/**
 * Collect all user data into an exportable envelope. API keys are stripped
 * from LLM provider configs for safe export (importing on a new device
 * requires re-entering keys).
 */
export async function collectAll(): Promise<ExportEnvelope> {
  const [sessions, reflections, streak, settings, llmSettings] = await Promise.all([
    sessionRepo.getAll(),
    reflectionRepo.getAll(),
    streakRepo.get(),
    settingsRepo.get(),
    llmSettingsRepo.get(),
  ]);

  // Strip API keys.
  const safeLLMSettings = llmSettings
    ? {
        ...llmSettings,
        providers: Object.fromEntries(
          Object.entries(llmSettings.providers).map(([name, cfg]) => [
            name,
            { ...cfg, apiKey: '' },
          ])
        ),
      }
    : null;

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions,
    reflections,
    streak,
    settings,
    llmSettings: safeLLMSettings,
  };
}

/**
 * Trigger a JSON file download of the export envelope.
 */
export function downloadExport(envelope: ExportEnvelope): void {
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chrono-kata-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- export.test`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: data export with API key stripping + tests" }
```

---

## Task 5: Data import utility (TDD)

**Files:**
- Create: `src/lib/data-transfer/import.ts`
- Test: `tests/unit/data-transfer/import.test.ts`

- [ ] **Step 1: Import test**

Create `tests/unit/data-transfer/import.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { replaceAll, parseEnvelope } from '@/lib/data-transfer/import';
import { resetDbForTesting, getDb } from '@/lib/db/db';
import { sessionRepo } from '@/lib/db/session.repo';
import type { ExportEnvelope } from '@/lib/data-transfer/types';

beforeEach(() => {
  resetDbForTesting();
});

const validEnvelope: ExportEnvelope = {
  version: 1,
  exportedAt: '2026-07-21T12:00:00.000Z',
  sessions: [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      startedAt: new Date('2026-07-21T10:00:00Z'),
      durationMinutes: 30,
      reps: null,
      rating: 4,
      createdAt: new Date('2026-07-21T10:00:00Z'),
      updatedAt: new Date('2026-07-21T10:00:00Z'),
    },
  ],
  reflections: [],
  streak: null,
  settings: null,
  llmSettings: null,
};

describe('parseEnvelope', () => {
  it('parses valid JSON', () => {
    const result = parseEnvelope(JSON.stringify(validEnvelope));
    expect(result.ok).toBe(true);
  });

  it('rejects invalid JSON', () => {
    const result = parseEnvelope('not json');
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported version', () => {
    const result = parseEnvelope(JSON.stringify({ ...validEnvelope, version: 2 }));
    expect(result.ok).toBe(false);
  });

  it('rejects missing version field', () => {
    const result = parseEnvelope(JSON.stringify({ sessions: [] }));
    expect(result.ok).toBe(false);
  });
});

describe('replaceAll', () => {
  it('wipes existing data and restores from envelope', async () => {
    // Seed with existing data
    await sessionRepo.save({
      startedAt: new Date(),
      durationMinutes: 99,
      reps: null,
      rating: 1,
    });
    expect(await sessionRepo.getAll()).toHaveLength(1);

    await replaceAll(validEnvelope);

    const all = await sessionRepo.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.durationMinutes).toBe(30);
  });

  it('preserves existing API keys when imported providers have empty keys', async () => {
    // Set up existing llmSettings with an API key
    const { llmSettingsRepo } = await import('@/lib/db/llm-settings.repo');
    const existing = await llmSettingsRepo.get();
    await llmSettingsRepo.addProvider('openai', {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-existing',
      model: 'gpt-4o',
    });

    // Import envelope with empty apiKey
    const envelopeWithLLM: ExportEnvelope = {
      ...validEnvelope,
      llmSettings: {
        id: 'singleton',
        activeProviderName: 'openai',
        providers: {
          openai: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o' },
        },
        totalTokensThisMonth: 0,
        totalTokensResetAt: new Date('2026-08-01'),
        updatedAt: new Date(),
      },
    };
    await replaceAll(envelopeWithLLM);

    const after = await llmSettingsRepo.get();
    expect(after.providers.openai?.apiKey).toBe('sk-existing');
  });
});
```

- [ ] **Step 2: Implement import**

Create `src/lib/data-transfer/import.ts`:

```typescript
import { getDb } from '@/lib/db/db';
import { llmSettingsRepo } from '@/lib/db/llm-settings.repo';
import type { ExportEnvelope } from './types';
import type { Session } from '@/lib/schemas/session';
import type { Reflection } from '@/lib/schemas/reflection';
import type { Streak } from '@/lib/schemas/streak';
import type { Settings } from '@/lib/schemas/settings';
import type { LLMSettings } from '@/lib/schemas/llm-settings';
import type { PendingCalendarOp } from '@/lib/schemas/pending-calendar-op';
import type { Token } from '@/lib/schemas/token';

export type ParseResult =
  | { ok: true; envelope: ExportEnvelope }
  | { ok: false; error: string };

export function parseEnvelope(json: string): ParseResult {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, error: 'Not a JSON object.' };
    }
    const p = parsed as Partial<ExportEnvelope>;
    if (p.version !== 1) {
      return { ok: false, error: `Unsupported version: ${p.version ?? 'missing'}. Only version 1 supported.` };
    }
    if (!Array.isArray(p.sessions)) {
      return { ok: false, error: 'Missing or invalid sessions array.' };
    }
    // Convert ISO date strings back to Date objects.
    const envelope: ExportEnvelope = {
      version: 1,
      exportedAt: p.exportedAt ?? new Date().toISOString(),
      sessions: p.sessions.map((s) => ({
        ...s,
        startedAt: new Date(s.startedAt),
        endedAt: s.endedAt ? new Date(s.endedAt) : null,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
      })) as Session[],
      reflections: (p.reflections ?? []).map((r) => ({
        ...r,
        periodStart: new Date(r.periodStart),
        periodEnd: new Date(r.periodEnd),
        createdAt: new Date(r.createdAt),
      })) as Reflection[],
      streak: p.streak
        ? {
            ...p.streak,
            updatedAt: new Date(p.streak.updatedAt),
          }
        : null,
      settings: p.settings
        ? {
            ...p.settings,
            createdAt: new Date(p.settings.createdAt),
            updatedAt: new Date(p.settings.updatedAt),
            googleCalendarConnectedAt: p.settings.googleCalendarConnectedAt
              ? new Date(p.settings.googleCalendarConnectedAt)
              : null,
          }
        : null,
      llmSettings: p.llmSettings
        ? {
            ...p.llmSettings,
            totalTokensResetAt: new Date(p.llmSettings.totalTokensResetAt),
            updatedAt: new Date(p.llmSettings.updatedAt),
          }
        : null,
    };
    return { ok: true, envelope };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * DANGEROUS: wipes ALL data and restores from envelope. Existing API keys
 * are preserved when imported entries have empty apiKey fields (since export
 * strips keys for safety).
 */
export async function replaceAll(envelope: ExportEnvelope): Promise<void> {
  const db = getDb();

  // Capture existing API keys before wipe (so we can restore them after).
  const existingLLM = await llmSettingsRepo.get();
  const existingKeys = new Map<string, string>();
  for (const [name, cfg] of Object.entries(existingLLM.providers)) {
    if (cfg.apiKey) existingKeys.set(name, cfg.apiKey);
  }

  // Wipe all tables.
  await Promise.all([
    db.sessions.clear(),
    db.reflections.clear(),
    db.streak.clear(),
    db.settings.clear(),
    db.llmSettings.clear(),
    db.pendingCalendarOps.clear(),
    db.tokens.clear(),
  ]);

  // Restore sessions.
  if (envelope.sessions.length > 0) {
    await db.sessions.bulkAdd(envelope.sessions);
  }

  // Restore reflections.
  if (envelope.reflections.length > 0) {
    await db.reflections.bulkAdd(envelope.reflections);
  }

  // Restore streak.
  if (envelope.streak) {
    await db.streak.put(envelope.streak);
  }

  // Restore settings.
  if (envelope.settings) {
    await db.settings.put(envelope.settings);
  }

  // Restore llmSettings — preserve existing API keys where envelope has empty.
  if (envelope.llmSettings) {
    const providersWithKeys = Object.fromEntries(
      Object.entries(envelope.llmSettings.providers).map(([name, cfg]) => [
        name,
        { ...cfg, apiKey: cfg.apiKey || existingKeys.get(name) || '' },
      ])
    );
    await db.llmSettings.put({
      ...envelope.llmSettings,
      providers: providersWithKeys,
    });
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- import.test`
Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: data import with API key preservation + tests" }
```

---

## Task 6: DataTransfer UI component + Settings integration

**Files:**
- Create: `src/components/settings/DataTransfer.tsx`
- Modify: `src/app/(main)/settings/page.tsx` to include `<DataTransfer />`

- [ ] **Step 1: DataTransfer component**

Create `src/components/settings/DataTransfer.tsx`:

```tsx
'use client';

import { useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/hooks/useToast';
import { collectAll, downloadExport } from '@/lib/data-transfer/export';
import { parseEnvelope, replaceAll } from '@/lib/data-transfer/import';
import { useQueryClient } from '@tanstack/react-query';

export function DataTransfer() {
  const toast = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{ sessions: number; reflections: number } | null>(null);
  const [pendingEnvelope, setPendingEnvelope] = useState<import('@/lib/data-transfer/types').ExportEnvelope | null>(null);

  async function handleExport() {
    try {
      const envelope = await collectAll();
      downloadExport(envelope);
      toast.show(`Exported ${envelope.sessions.length} sessions`, 'success');
    } catch (e) {
      toast.show(`Export failed: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseEnvelope(String(reader.result));
      if (!result.ok) {
        toast.show(`Import failed: ${result.error}`, 'error');
        return;
      }
      setPendingEnvelope(result.envelope);
      setPendingImport({
        sessions: result.envelope.sessions.length,
        reflections: result.envelope.reflections.length,
      });
    };
    reader.onerror = () => toast.show('Failed to read file', 'error');
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  async function confirmImport() {
    if (!pendingEnvelope) return;
    try {
      await replaceAll(pendingEnvelope);
      toast.show(`Imported ${pendingEnvelope.sessions.length} sessions`, 'success');
      // Invalidate all queries to refresh UI
      qc.invalidateQueries();
    } catch (e) {
      toast.show(`Import failed: ${e instanceof Error ? e.message : 'unknown'}`, 'error');
    }
    setPendingEnvelope(null);
    setPendingImport(null);
  }

  function cancelImport() {
    setPendingEnvelope(null);
    setPendingImport(null);
  }

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">
        Backup & Restore
      </div>
      <p className="text-text-muted text-sm mb-4">
        Export all data (sessions, reflections, settings) as JSON. API keys are stripped from exports for safety.
        Importing replaces ALL local data — existing API keys are preserved when the import file has empty key fields.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={handleExport}>Export JSON</Button>
        <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>Import JSON…</Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <ConfirmDialog
        open={!!pendingImport}
        title="Replace all data?"
        message={
          pendingImport
            ? `This will WIPE all existing data and restore ${pendingImport.sessions} session${pendingImport.sessions === 1 ? '' : 's'} and ${pendingImport.reflections} reflection${pendingImport.reflections === 1 ? '' : 's'} from the file. Cannot be undone.`
            : ''
        }
        confirmLabel="Replace all"
        onConfirm={confirmImport}
        onCancel={cancelImport}
      />
    </Card>
  );
}
```

- [ ] **Step 2: Add to Settings page**

Modify `src/app/(main)/settings/page.tsx` — add import at top:

```tsx
import { DataTransfer } from '@/components/settings/DataTransfer';
```

And include `<DataTransfer />` somewhere in the JSX (suggested placement: after the existing "Clear all data" card, before any final sections).

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .; if ($?) { git commit -m "feat: data export/import UI in Settings" }
```

---

## Task 7: Final Wave 6 verification

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: all tests pass (82 prior + ~24 new = 106+).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: succeeds with `/insights` route present.

- [ ] **Step 4: Commit any final tweaks**

```powershell
git status; if ($?) { git add .; if ($?) { git commit -m "chore: wave 6 final verification" } }
```

---

## Wave 6 Definition of Done

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` — 106+ tests pass
- [ ] `npm run build` succeeds
- [ ] Tab bar shows 6 tabs (Home, Sessions, Reflect, Insights, LLM, Settings)
- [ ] `/insights` page renders all-time totals + heatmap + 30-day rating trend + activity breakdown
- [ ] Heatmap handles empty data gracefully (renders full year of empty cells)
- [ ] Heatmap navigates between years via ‹ › buttons
- [ ] Settings page has "Backup & Restore" section
- [ ] Export downloads a JSON file named `chrono-kata-backup-YYYY-MM-DD.json`
- [ ] Export file does NOT contain API keys (all stripped to empty string)
- [ ] Import shows confirm dialog with counts before replacing data
- [ ] Import preserves existing API keys when envelope has empty values
- [ ] No `as any`, no `@ts-ignore`, no `@ts-expect-error` in source

## What's Next (Future Waves)

- **Wave 7: Notifications** — Web Push for daily reminders, user-set time.
- **Wave 8: Streaming LLM** — better UX for coach comments (replace polling with SSE/streamed tokens).
- **Wave 9: Multi-dimensional ratings** — focus/energy/mood sliders alongside the 1-5.
- **Wave 10: Theme toggle** — light mode support via CSS variables.
