import type { AnalyticsTimelinePoint } from '@quiz/shared/analytics';
import { barScale, seriesPath, seriesPoints } from '@quiz/shared/analytics';

import { timelineSummary, windowLabel } from '@/lib/analytics-params';
import { percentLabel } from '@/lib/dashboard-params';

interface Props {
  points: readonly AnalyticsTimelinePoint[];
  days: number;
  height?: number;
}

const WIDTH = 720;
const PADDING = 6;

/**
 * Attempts (bars) and registrations (line) over the selected window.
 *
 * Hand-rolled SVG, like the Day 10 trend: it renders on the server, ships no
 * client JavaScript and takes its scale from a tested helper. Bars rather than a
 * line for attempts because the interesting question is "how many that day",
 * and the registration line sits on top so a jump in sign-ups is visible next to
 * the activity it produced.
 */
export function AnalyticsTimeline({ points, days, height = 150 }: Props) {
  if (points.length === 0) {
    return (
      <div className="border-border/60 text-muted-foreground grid h-[150px] place-items-center rounded-lg border border-dashed text-[12px]">
        Nothing happened in {windowLabel(days).toLowerCase()}.
      </div>
    );
  }

  const attempts = points.map((point) => point.attempts);
  const registrations = points.map((point) => point.registrations);
  const heights = barScale(attempts);
  const linePoints = seriesPoints(registrations, WIDTH, height, PADDING);

  const innerWidth = WIDTH - PADDING * 2;
  const slot = innerWidth / points.length;
  const barWidth = Math.max(2, Math.min(18, slot * 0.62));

  const maxAttempts = attempts.reduce((best, value) => Math.max(best, value), 0);
  const totalRegistrations = registrations.reduce((sum, value) => sum + value, 0);

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={timelineSummary(points)}
        className="h-[150px] w-full overflow-visible"
      >
        {/* baseline and the halfway rule, so a tall bar has a reference */}
        {[0, 0.5, 1].map((fraction) => {
          const y = PADDING + (1 - fraction) * (height - PADDING * 2);
          return (
            <line
              key={fraction}
              x1={PADDING}
              x2={WIDTH - PADDING}
              y1={y}
              y2={y}
              className="stroke-border/50"
              strokeWidth={1}
              strokeDasharray={fraction === 0.5 ? '3 4' : undefined}
            />
          );
        })}

        {points.map((point, index) => {
          const barHeight = (heights[index] ?? 0) / 100;
          const top = PADDING + (1 - barHeight) * (height - PADDING * 2);
          const x = PADDING + slot * index + (slot - barWidth) / 2;

          return (
            <g key={`${point.date}-bar`}>
              <rect
                x={x}
                y={top}
                width={barWidth}
                height={Math.max(1, height - PADDING - top)}
                rx={1.5}
                className={point.attempts === 0 ? 'fill-border/50' : 'fill-primary/60'}
              >
                <title>{`${point.label} · ${point.attempts} attempt${
                  point.attempts === 1 ? '' : 's'
                }${point.registrations > 0 ? ` · ${point.registrations} registered` : ''}${
                  point.averagePercentage != null
                    ? ` · avg ${percentLabel(point.averagePercentage)}`
                    : ''
                }`}</title>
              </rect>
            </g>
          );
        })}

        {/* registrations on their own scale — a sign-up spike should be visible */}
        {totalRegistrations > 0 ? (
          <path
            d={seriesPath(linePoints)}
            fill="none"
            className="stroke-warning"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {totalRegistrations > 0
          ? linePoints.map((point, index) => (
              <circle
                key={`${points[index]?.date ?? index}-reg`}
                cx={point.x}
                cy={point.y}
                r={points[index]?.registrations ? 2.4 : 1.4}
                className={
                  points[index]?.registrations
                    ? 'fill-warning stroke-background'
                    : 'fill-warning/40'
                }
                strokeWidth={1.2}
              />
            ))
          : null}
      </svg>

      <div className="text-muted-foreground flex items-center justify-between text-[10.5px]">
        <span>{points[0]?.label}</span>
        <span className="tabular-nums">
          busiest day {maxAttempts} attempt{maxAttempts === 1 ? '' : 's'}
          {totalRegistrations > 0
            ? ` · ${totalRegistrations} registration${totalRegistrations === 1 ? '' : 's'}`
            : ''}
        </span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}
