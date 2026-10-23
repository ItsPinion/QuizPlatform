import type { StudentDashboard } from '@quiz/shared/dashboard';
import {
  passMarkY,
  scoreChartArea,
  scoreChartPath,
  scoreChartPoints,
} from '@quiz/shared/dashboard';

import {
  deltaLabel,
  trendDateLabel,
  trendDelta,
  trendPointLabel,
  trendSummary,
} from '@/lib/dashboard-params';
import { cn } from '@/lib/utils';

interface Props {
  trend: StudentDashboard['trend'];
  passMark?: number;
  height?: number;
}

const WIDTH = 560;

/**
 * The score trend.
 *
 * A hand-rolled SVG rather than a chart dependency: it is a server component, it
 * ships no JavaScript, and the geometry comes from tested helpers in
 * `@quiz/shared/dashboard` instead of from a library's defaults. The y axis is
 * pinned to 0–100 so a wobble between 72% and 78% looks like a wobble, and the
 * pass mark is drawn as a rule so a point above or below it is obvious.
 */
export function ScoreTrendChart({ trend, passMark = 60, height = 132 }: Props) {
  const points = scoreChartPoints(
    trend.map((point) => point.percentage),
    WIDTH,
    height,
    10,
  );

  const line = scoreChartPath(points);
  const area = scoreChartArea(points, height, 10);
  const markY = passMarkY(passMark, height, 10);
  const delta = trendDelta(trend);
  const last = trend[trend.length - 1];

  if (trend.length === 0) {
    return (
      <div className="border-border/60 text-muted-foreground grid h-[132px] place-items-center rounded-lg border border-dashed text-[12px]">
        Finish an attempt and the trend appears here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px]">
          <span className="font-semibold tabular-nums">{trend.length}</span>{' '}
          <span className="text-muted-foreground">
            graded attempt{trend.length === 1 ? '' : 's'}
          </span>
        </p>
        <p
          className={cn(
            'text-[11.5px] tabular-nums',
            delta == null
              ? 'text-muted-foreground'
              : delta > 0
                ? 'text-success'
                : delta < 0
                  ? 'text-destructive'
                  : 'text-muted-foreground',
          )}
        >
          {deltaLabel(delta)}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={trendSummary(trend)}
        className="h-[132px] w-full overflow-visible"
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* grid: 0 / 50 / 100 */}
        {[0, 50, 100].map((value) => {
          const y = passMarkY(value, height, 10);
          return (
            <line
              key={value}
              x1={10}
              x2={WIDTH - 10}
              y1={y}
              y2={y}
              className="stroke-border/50"
              strokeWidth={1}
              strokeDasharray={value === 50 ? '3 4' : undefined}
            />
          );
        })}

        {/* the pass mark */}
        <line
          x1={10}
          x2={WIDTH - 10}
          y1={markY}
          y2={markY}
          className="stroke-warning/70"
          strokeWidth={1}
          strokeDasharray="5 4"
        />
        <text x={WIDTH - 10} y={markY - 4} textAnchor="end" className="fill-warning text-[9px]">
          pass {passMark}%
        </text>

        <path d={area} fill="url(#trend-fill)" className="text-primary" />
        <path
          d={line}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/*
          Each point owns its <title> so the browser shows the tooltip when the
          pointer is anywhere on the dot. The text must be a single string:
          JSX text mixed with expressions produces an array of children, which
          React cannot serialise inside <title> (it warns, then the server and
          client markup disagree and hydration fails).
        */}
        {points.map((point, index) => {
          const item = trend[index];
          if (!item) return null;

          return (
            <circle
              key={item.attemptId}
              cx={point.x}
              cy={point.y}
              r={item.passed ? 3.2 : 2.6}
              className={cn(
                item.passed
                  ? 'fill-primary stroke-background'
                  : 'fill-destructive stroke-background',
              )}
              strokeWidth={1.4}
            >
              <title>{trendPointLabel(item)}</title>
            </circle>
          );
        })}
      </svg>

      <div className="text-muted-foreground flex items-center justify-between text-[10.5px]">
        <span>{trend[0] ? trendDateLabel(trend[0].completedAt) : ''}</span>
        <span className="font-mono">
          last {last ? `${Number(last.percentage.toFixed(2))}%` : '—'}{' '}
          {last ? (last.passed ? '· passed' : '· failed') : ''}
        </span>
        <span>{last ? trendDateLabel(last.completedAt) : ''}</span>
      </div>
    </div>
  );
}
