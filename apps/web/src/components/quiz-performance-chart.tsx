import type { QuizPerformanceRow } from '@quiz/shared/analytics';
import { BarChart3 } from 'lucide-react';
import Link from 'next/link';

import { passRateCaption, popularityCaption, scoreBarWidth } from '@/lib/analytics-params';
import { percentLabel } from '@/lib/dashboard-params';
import { cn } from '@/lib/utils';

interface Props {
  rows: readonly QuizPerformanceRow[];
  /** How many to show; the API returns every attempted quiz. */
  limit?: number;
}

function barTone(average: number | null): string {
  if (average == null) return 'bg-muted-foreground/30';
  if (average >= 70) return 'bg-success/70';
  if (average >= 50) return 'bg-warning/70';
  return 'bg-destructive/60';
}

/**
 * The most popular quizzes, with the average score each one earns.
 *
 * Rows are already ordered by attempts on the API, so "popular" means the same
 * thing here as in the payload. The bar measures the average score against 100%
 * (not against the best quiz), while the caption carries attempts and learners —
 * a quiz that is popular *and* hard should look popular and hard.
 */
export function QuizPerformanceChart({ rows, limit = 6 }: Props) {
  if (rows.length === 0) {
    return (
      <div className="border-border/60 text-muted-foreground grid h-[120px] place-items-center rounded-lg border border-dashed text-[12px]">
        No quiz has been attempted yet.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.slice(0, limit).map((row) => (
        <li key={row.quizId} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <Link
              href={`/admin/quizzes/${row.quizId}`}
              className="hover:text-primary truncate text-[12.5px] font-medium transition-colors"
            >
              {row.title}
            </Link>
            <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
              {percentLabel(row.averagePercentage)}
            </span>
          </div>

          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={cn('h-full rounded-full', barTone(row.averagePercentage))}
              style={{ width: `${scoreBarWidth(row.averagePercentage)}%` }}
            />
          </div>

          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-[10.5px]">
            <span>{popularityCaption(row)}</span>
            <span aria-hidden="true">·</span>
            <span
              className={cn(row.passRate != null && row.passRate < 50 ? 'text-warning' : undefined)}
            >
              {passRateCaption(row.passRate)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{row.categoryName}</span>
          </p>
        </li>
      ))}

      {rows.length > limit ? (
        <li className="text-muted-foreground flex items-center gap-1.5 pt-1 text-[10.5px]">
          <BarChart3 className="size-3" />
          {rows.length - limit} more attempted quiz{rows.length - limit === 1 ? '' : 'zes'} in the
          payload
        </li>
      ) : null}
    </ul>
  );
}
