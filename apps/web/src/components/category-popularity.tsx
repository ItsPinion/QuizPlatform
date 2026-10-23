import type { CategoryAnalyticsRow } from '@quiz/shared/analytics';
import { barScale } from '@quiz/shared/analytics';

import { categoryCaption } from '@/lib/analytics-params';
import { percentLabel } from '@/lib/dashboard-params';
import { cn } from '@/lib/utils';

interface Props {
  rows: readonly CategoryAnalyticsRow[];
  limit?: number;
}

/**
 * Attempts per category, measured against the busiest category.
 *
 * Popularity is relative by definition, so the bars are scaled to the leader —
 * the absolute counts sit in the caption. Categories nobody has touched keep
 * their row (as an empty bar) so the console shows the gap rather than hiding it.
 */
export function CategoryPopularity({ rows, limit = 8 }: Props) {
  if (rows.length === 0) {
    return (
      <div className="border-border/60 text-muted-foreground grid h-[120px] place-items-center rounded-lg border border-dashed text-[12px]">
        No categories have been created yet.
      </div>
    );
  }

  const shown = rows.slice(0, limit);
  const widths = barScale(shown.map((row) => row.attempts));

  return (
    <ul className="space-y-2.5">
      {shown.map((row, index) => (
        <li key={row.categoryId} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[12.5px] font-medium">{row.name}</span>
            <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
              {percentLabel(row.averagePercentage)}
            </span>
          </div>

          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={cn('h-full rounded-full', index === 0 ? 'bg-primary/80' : 'bg-primary/45')}
              style={{ width: `${Math.max(2, widths[index] ?? 0)}%` }}
            />
          </div>

          <p className="text-muted-foreground text-[10.5px]">{categoryCaption(row)}</p>
        </li>
      ))}
    </ul>
  );
}
