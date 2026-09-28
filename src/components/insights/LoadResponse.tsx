'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import {
  analyzeLoadResponse,
  getCorrelationCaption,
  type TimelineDay,
} from '@/lib/insights/load-response';
import { DEFAULT_DEMO_DATA } from '@/lib/pacing/seed-data';
import type { CheckIn } from '@/lib/schemas/check-in';
import type { KataTemplate } from '@/lib/schemas/kata-template';
import type { Session } from '@/lib/schemas/session';

interface Props {
  readonly sessions: readonly Session[];
  readonly checkIns: readonly CheckIn[];
  readonly kataTemplates: readonly KataTemplate[];
}

export function LoadResponse({ sessions, checkIns, kataTemplates }: Props) {
  // If the user has 0 check-ins in their database, offer demo data by default so they see what it looks like.
  const hasUserCheckIns = checkIns.length > 0;
  const [useDemoData, setUseDemoData] = useState(!hasUserCheckIns);
  const [lag, setLag] = useState<1 | 2>(1);
  const [hoveredDay, setHoveredDay] = useState<TimelineDay | null>(null);

  const activeSessions = useDemoData ? DEFAULT_DEMO_DATA.sessions : sessions;
  const activeCheckIns = useDemoData ? DEFAULT_DEMO_DATA.checkIns : checkIns;
  const activeTemplates = useDemoData ? DEFAULT_DEMO_DATA.templates : kataTemplates;

  const analysis = useMemo(() => {
    return analyzeLoadResponse(activeSessions, activeCheckIns, activeTemplates, {
      daysCount: 30,
      lag,
      endDate: useDemoData ? DEFAULT_DEMO_DATA.referenceDate : undefined,
    });
  }, [activeSessions, activeCheckIns, activeTemplates, lag, useDemoData]);

  const {
    timelineDays,
    pairs,
    correlation,
    envelope,
    maxDailyLoad,
    stoppedAtCapMonthCount,
    totalMonthSessions,
  } = analysis;

  // Chart layout constants
  const timelineSvgWidth = 540;
  const timelineSvgHeight = 220;
  const padLeft = 40;
  const padRight = 40;
  const padTop = 20;
  const padBottom = 34;
  const plotWidth = timelineSvgWidth - padLeft - padRight;
  const plotHeight = timelineSvgHeight - padTop - padBottom;

  // Scales for Timeline
  const loadAxisMax = Math.max(30, Math.ceil((maxDailyLoad + 5) / 10) * 10);
  const getYLoad = (load: number) => padTop + (1 - load / loadAxisMax) * plotHeight;
  const getYWellbeing = (score: number) => padTop + (1 - score) * plotHeight;

  const daySlotWidth = timelineDays.length > 0 ? plotWidth / timelineDays.length : 10;
  const barWidth = Math.max(4, daySlotWidth - 4);

  // Build wellbeing line path
  const linePoints: Array<{ x: number; y: number; day: TimelineDay }> = [];
  timelineDays.forEach((day, idx) => {
    if (day.nextDayWellbeing !== null) {
      const cx = padLeft + idx * daySlotWidth + daySlotWidth / 2;
      const cy = getYWellbeing(day.nextDayWellbeing);
      linePoints.push({ x: cx, y: cy, day });
    }
  });

  const wellbeingPath = linePoints.length > 0
    ? `M ${linePoints.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`
    : '';

  // Envelope Y coordinate
  const envelopeVal = !('insufficientData' in envelope) ? envelope.envelope : null;
  const envelopeY = envelopeVal !== null ? getYLoad(envelopeVal) : null;

  // Scatter Plot Layout
  const scatterWidth = 500;
  const scatterHeight = 220;
  const sPadLeft = 46;
  const sPadRight = 20;
  const sPadTop = 20;
  const sPadBottom = 38;
  const sPlotWidth = scatterWidth - sPadLeft - sPadRight;
  const sPlotHeight = scatterHeight - sPadTop - sPadBottom;

  const maxScatterLoad = Math.max(30, Math.ceil((Math.max(1, ...pairs.map(([l]) => l)) + 5) / 10) * 10);
  const getScatterX = (load: number) => sPadLeft + (load / maxScatterLoad) * sPlotWidth;
  const getScatterY = (wb: number) => sPadTop + (1 - wb) * sPlotHeight;

  // Linear regression trend line for scatter if n >= 3
  const trendLine = useMemo(() => {
    if (pairs.length < 3) return null;
    const n = pairs.length;
    let sumX = 0;
    let sumY = 0;
    for (const [x, y] of pairs) {
      sumX += x;
      sumY += y;
    }
    const meanX = sumX / n;
    const meanY = sumY / n;

    let cov = 0;
    let varX = 0;
    for (const [x, y] of pairs) {
      cov += (x - meanX) * (y - meanY);
      varX += (x - meanX) * (x - meanX);
    }
    if (varX === 0) return null;
    const slope = cov / varX;
    const intercept = meanY - slope * meanX;

    const x1 = 0;
    const y1 = Math.max(0, Math.min(1, intercept));
    const x2 = maxScatterLoad;
    const y2 = Math.max(0, Math.min(1, intercept + slope * maxScatterLoad));

    return {
      x1: getScatterX(x1),
      y1: getScatterY(y1),
      x2: getScatterX(x2),
      y2: getScatterY(y2),
    };
  }, [pairs, maxScatterLoad]);

  return (
    <div className="space-y-4">
      {/* Header and Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl text-text">Load-Response Insights</h2>
          <p className="text-xs text-text-muted">
            Tracking post-exertional symptom lag and safe activity thresholds
          </p>
        </div>

        {/* Data Source Switcher */}
        <div className="inline-flex self-start sm:self-auto rounded-xl bg-surface-2 p-0.5 text-xs font-medium border border-border/50">
          <button
            type="button"
            onClick={() => setUseDemoData(false)}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              !useDemoData
                ? 'bg-accent text-base font-semibold shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            My Data {hasUserCheckIns && `(${checkIns.length})`}
          </button>
          <button
            type="button"
            onClick={() => setUseDemoData(true)}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              useDemoData
                ? 'bg-accent text-base font-semibold shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Demo Seed Data
          </button>
        </div>
      </div>

      {/* Cap Success Callout */}
      <Card className="bg-surface-2/60 border-accent/30">
        <div className="flex items-start gap-3">
          <div className="text-2xl select-none" aria-hidden="true">
            🎯
          </div>
          <div className="space-y-0.5">
            <div className="text-xs uppercase tracking-wider text-accent font-semibold">
              Pacing Discipline (This Month)
            </div>
            <div className="text-sm font-medium text-text">
              <span className="font-serif text-lg font-bold text-accent">
                {stoppedAtCapMonthCount}
              </span>{' '}
              session{stoppedAtCapMonthCount === 1 ? '' : 's'} stopped at soft cap
              {totalMonthSessions > 0 && ` out of ${totalMonthSessions} practice sessions`}
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Stopping when you reach your soft cap boundary helps prevent the post-exertional
              crash cycle before it begins.
            </p>
          </div>
        </div>
      </Card>

      {/* Main Timeline Card */}
      <Card>
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <div>
              <div className="text-xs uppercase tracking-wide text-text-muted">
                30-Day Training Load & Next-Day Wellbeing
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                Bars: Daily Load (min) • Green line: Next-day wellbeing (0.0 to 1.0)
              </div>
            </div>

            {/* Envelope Badge */}
            {envelopeVal !== null ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/15 border border-accent/30 text-xs font-medium text-text">
                <span className="w-2 h-2 rounded-full bg-accent inline-block" />
                <span>
                  Safe Envelope: <strong className="text-accent">{envelopeVal}m</strong>
                  {' ('}
                  {!('insufficientData' in envelope) && envelope.confidence} conf{')'}
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border text-xs text-text-muted">
                <span>
                  Need {Math.max(0, 14 - pairs.length)} more check-in days for envelope
                </span>
              </div>
            )}
          </div>

          {/* Timeline SVG */}
          <div className="w-full overflow-x-auto no-scrollbar">
            <div className="min-w-[480px]">
              <svg
                viewBox={`0 0 ${timelineSvgWidth} ${timelineSvgHeight}`}
                className="w-full h-auto select-none"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Horizontal Grid lines */}
                {[0, 0.5, 1.0].map((level) => {
                  const y = getYWellbeing(level);
                  return (
                    <g key={level}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={timelineSvgWidth - padRight}
                        y2={y}
                        stroke="var(--color-border)"
                        strokeWidth="0.75"
                        strokeDasharray={level === 0 ? undefined : '2 3'}
                      />
                      {/* Left Load Axis Label */}
                      <text
                        x={padLeft - 6}
                        y={y + 3}
                        textAnchor="end"
                        fontSize="9"
                        fill="var(--color-text-muted)"
                      >
                        {Math.round(level * loadAxisMax)}m
                      </text>
                      {/* Right Wellbeing Axis Label */}
                      <text
                        x={timelineSvgWidth - padRight + 6}
                        y={y + 3}
                        textAnchor="start"
                        fontSize="9"
                        fill="var(--color-zen)"
                      >
                        {level.toFixed(1)}
                      </text>
                    </g>
                  );
                })}

                {/* Safe Load Envelope Line */}
                {envelopeY !== null && (
                  <g>
                    <line
                      x1={padLeft}
                      y1={envelopeY}
                      x2={timelineSvgWidth - padRight}
                      y2={envelopeY}
                      stroke="var(--color-hype)"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />
                    <text
                      x={timelineSvgWidth - padRight - 4}
                      y={envelopeY - 4}
                      textAnchor="end"
                      fontSize="9"
                      fontWeight="bold"
                      fill="var(--color-hype)"
                    >
                      Envelope ({envelopeVal}m)
                    </text>
                  </g>
                )}

                {/* Load Bars for each day */}
                {timelineDays.map((day, idx) => {
                  const x = padLeft + idx * daySlotWidth + (daySlotWidth - barWidth) / 2;
                  const barH = (day.load / loadAxisMax) * plotHeight;
                  const y = padTop + plotHeight - barH;

                  return (
                    <g
                      key={day.date}
                      className="cursor-pointer"
                      onClick={() => setHoveredDay(day)}
                      onMouseEnter={() => setHoveredDay(day)}
                    >
                      {/* Invisible hover target */}
                      <rect
                        x={padLeft + idx * daySlotWidth}
                        y={padTop}
                        width={daySlotWidth}
                        height={plotHeight + 20}
                        fill="transparent"
                      />

                      {/* Load Bar */}
                      {day.load > 0 ? (
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={Math.max(2, barH)}
                          rx="2"
                          fill="var(--color-accent)"
                          opacity={hoveredDay?.date === day.date ? 1 : 0.75}
                        />
                      ) : (
                        /* Rest day marker */
                        <rect
                          x={x + barWidth / 2 - 1}
                          y={padTop + plotHeight - 3}
                          width="2"
                          height="3"
                          fill="var(--color-text-muted)"
                          opacity="0.4"
                        />
                      )}

                      {/* Low energy marker (dot at base if energy <= 2) */}
                      {day.isLowEnergyDay && (
                        <circle
                          cx={x + barWidth / 2}
                          cy={padTop + plotHeight + 7}
                          r="2.5"
                          fill="var(--color-hype)"
                        />
                      )}

                      {/* Date Axis Label (every 6th day or first/last) */}
                      {(idx % 6 === 0 || idx === timelineDays.length - 1) && (
                        <text
                          x={x + barWidth / 2}
                          y={timelineSvgHeight - 8}
                          textAnchor="middle"
                          fontSize="9"
                          fill="var(--color-text-muted)"
                        >
                          {day.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Next-Day Wellbeing Connecting Line */}
                {wellbeingPath && (
                  <path
                    d={wellbeingPath}
                    fill="none"
                    stroke="var(--color-zen)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Next-Day Wellbeing Points */}
                {linePoints.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredDay?.date === pt.day.date ? '4' : '2.5'}
                    fill="var(--color-surface)"
                    stroke="var(--color-zen)"
                    strokeWidth="2"
                  />
                ))}
              </svg>
            </div>
          </div>

          {/* Interactive Tooltip & Day Legend */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs pt-2 border-t border-border/40 gap-2 min-h-[30px]">
            <div className="text-text-muted">
              {hoveredDay ? (
                <span>
                  <strong className="text-text">{hoveredDay.date}</strong> ({hoveredDay.label}):{' '}
                  Load <strong className="text-accent">{hoveredDay.load}m</strong>
                  {hoveredDay.isRestDay && ' (Rest Day)'}
                  {hoveredDay.energy !== null && ` • Today energy: ${hoveredDay.energy}/5`}
                  {hoveredDay.isLowEnergyDay && ' (Low Energy Day)'}
                  {hoveredDay.nextDayWellbeing !== null ? (
                    <span>
                      {' '}
                      • Next-day wellbeing:{' '}
                      <strong className="text-zen">
                        {hoveredDay.nextDayWellbeing.toFixed(2)}
                      </strong>
                    </span>
                  ) : (
                    ' • (No next-day check-in)'
                  )}
                </span>
              ) : (
                <span>Tap or hover any day bar to inspect load and next-day wellbeing</span>
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 text-[11px] text-text-muted flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-accent inline-block" /> Load
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-1 bg-zen rounded-full inline-block" /> Wellbeing
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-hype inline-block" /> Low energy
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Lag Scatter Plot Card */}
      <Card>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-text-muted">
                Lag Scatter: Load vs. Next-Day Wellbeing
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                Testing whether heavier exertion predicts reduced wellbeing
              </div>
            </div>

            {/* Lag Toggle */}
            <div className="inline-flex rounded-xl bg-surface-2 p-0.5 text-xs font-medium border border-border/50">
              <button
                type="button"
                onClick={() => setLag(1)}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  lag === 1
                    ? 'bg-accent text-base font-semibold'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                Lag 1 (Day N+1)
              </button>
              <button
                type="button"
                onClick={() => setLag(2)}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  lag === 2
                    ? 'bg-accent text-base font-semibold'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                Lag 2 (Day N+2)
              </button>
            </div>
          </div>

          {/* Scatter Plot SVG */}
          {pairs.length < 2 ? (
            <div className="py-12 text-center text-text-muted text-sm border border-dashed border-border rounded-xl">
              <p>Need at least 2 paired check-in days to plot load response.</p>
              {!useDemoData && (
                <button
                  type="button"
                  onClick={() => setUseDemoData(true)}
                  className="mt-2 text-xs text-accent underline underline-offset-2"
                >
                  Explore with Demo Data
                </button>
              )}
            </div>
          ) : (
            <div className="w-full overflow-x-auto no-scrollbar">
              <div className="min-w-[450px]">
                <svg
                  viewBox={`0 0 ${scatterWidth} ${scatterHeight}`}
                  className="w-full h-auto select-none"
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* Grid Lines */}
                  {[0, 0.5, 1.0].map((wb) => {
                    const y = getScatterY(wb);
                    return (
                      <g key={wb}>
                        <line
                          x1={sPadLeft}
                          y1={y}
                          x2={scatterWidth - sPadRight}
                          y2={y}
                          stroke="var(--color-border)"
                          strokeWidth="0.75"
                          strokeDasharray="2 2"
                        />
                        <text
                          x={sPadLeft - 6}
                          y={y + 3}
                          textAnchor="end"
                          fontSize="9"
                          fill="var(--color-text-muted)"
                        >
                          {wb.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}

                  {/* X Axis Ticks (Load) */}
                  {[0, Math.round(maxScatterLoad / 2), maxScatterLoad].map((ld) => {
                    const x = getScatterX(ld);
                    return (
                      <g key={ld}>
                        <line
                          x1={x}
                          y1={scatterHeight - sPadBottom}
                          x2={x}
                          y2={scatterHeight - sPadBottom + 4}
                          stroke="var(--color-border)"
                          strokeWidth="1"
                        />
                        <text
                          x={x}
                          y={scatterHeight - sPadBottom + 14}
                          textAnchor="middle"
                          fontSize="9"
                          fill="var(--color-text-muted)"
                        >
                          {ld}m
                        </text>
                      </g>
                    );
                  })}

                  {/* Trendline */}
                  {trendLine && (
                    <line
                      x1={trendLine.x1}
                      y1={trendLine.y1}
                      x2={trendLine.x2}
                      y2={trendLine.y2}
                      stroke="var(--color-accent)"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      opacity="0.8"
                    />
                  )}

                  {/* Scatter Points */}
                  {pairs.map(([loadVal, wbVal], idx) => {
                    const cx = getScatterX(loadVal);
                    const cy = getScatterY(wbVal);
                    return (
                      <circle
                        key={idx}
                        cx={cx}
                        cy={cy}
                        r="4"
                        fill="var(--color-accent)"
                        stroke="var(--color-base)"
                        strokeWidth="1.2"
                        opacity="0.85"
                      >
                        <title>{`Load: ${loadVal}m -> Next Wellbeing: ${wbVal.toFixed(2)}`}</title>
                      </circle>
                    );
                  })}

                  {/* Axis Titles */}
                  <text
                    x={scatterWidth / 2}
                    y={scatterHeight - 6}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill="var(--color-text-muted)"
                  >
                    Training Load on Day N (minutes)
                  </text>
                  <text
                    x={12}
                    y={scatterHeight / 2}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill="var(--color-text-muted)"
                    transform={`rotate(-90 12 ${scatterHeight / 2})`}
                  >
                    Wellbeing Day N+{lag}
                  </text>
                </svg>
              </div>
            </div>
          )}

          {/* Statistical Summary & Plain-Language Caption */}
          <div className="bg-surface-2/40 rounded-xl p-3 border border-border/40 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <span>
                  Observations: <strong className="text-text">n = {correlation.n}</strong>
                </span>
                <span>
                  Spearman:{' '}
                  <strong className="text-accent">
                    {correlation.spearman !== null ? correlation.spearman.toFixed(2) : '—'}
                  </strong>
                </span>
                <span>
                  Pearson:{' '}
                  <strong className="text-text">
                    {correlation.pearson !== null ? correlation.pearson.toFixed(2) : '—'}
                  </strong>
                </span>
              </div>
            </div>

            <p className="text-xs text-text leading-relaxed">
              {getCorrelationCaption(correlation, lag)}
            </p>

            <p className="text-[11px] text-text-muted leading-relaxed italic border-t border-border/30 pt-1.5">
              Honest caveat: Small sample size (n = {correlation.n}). Correlation does not imply
              causation. Wellbeing is deeply affected by sleep quality, weather shifts, infection
              flares, medication, and emotional stressors.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
