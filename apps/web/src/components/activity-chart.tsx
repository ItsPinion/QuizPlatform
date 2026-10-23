import type { ActivityDay } from '@quiz/shared/dashboard';

import { activityCaption, activityHeight, activityScale } from '@/lib/dashboard-params';
import { cn } from '@/lib/utils';

interface Props {
  days: readonly ActivityDay[];
}

/**
 * Attempts per day over the last fortnight.
 *
 * CSS bars, not SVG: fourteen boxes need no geometry, and the empty days get to
 * stay visible as a hairline. The height is a percentage of the busiest day, so
 * the chart is honest about intensity rather than just showing "something
 * happened".
 */
export function ActivityChart({ days }: Props) {
  const scale = activityScale(days);

  return (
    <div className="space-y-2">
      <div className="flex h-[72px] items-end gap-1" role="img" aria-label={activityCaption(days)}>
        {days.map((day) => {
          const height = activityHeight(day, scale);

          return (
            <div key={day.date} className="flex h-full flex-1 flex-col justify-end">
              <div
                className={cn(
                  'rounded-sm transition-all',
                  day.attempts === 0 ? 'bg-border/60' : 'bg-primary/70',
                )}
                style={{ height: day.attempts === 0 ? 2 : `${Math.max(12, height)}%` }}
                title={`${day.label}: ${day.attempts} attempt${day.attempts === 1 ? '' : 's'}${
                  day.averagePercentage != null
                    ? ` · avg ${Number(day.averagePercentage.toFixed(2))}%`
                    : ''
                }`}
              />
            </div>
          );
        })}
      </div>

      <div className="text-muted-foreground flex items-center justify-between text-[10px]">
        <span>{days[0]?.label}</span>
        <span className="tabular-nums">{activityCaption(days)}</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
    </div>
  );
}
