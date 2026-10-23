import type { StudentDashboard } from '@quiz/shared/dashboard';
import Link from 'next/link';

import { categoryBarWidth, categoryCaption, percentLabel } from '@/lib/dashboard-params';
import { cn } from '@/lib/utils';

interface Props {
  categories: StudentDashboard['categories'];
}

/** Tone for a bar, measured against the nearest pass mark in the dataset. */
function barTone(average: number): string {
  if (average >= 60) return 'bg-success/70';
  if (average >= 50) return 'bg-warning/70';
  return 'bg-destructive/60';
}

/**
 * Average score per category.
 *
 * Scaled against 100%, not against the best category: a student averaging 40%
 * everywhere should see four short bars, not four full ones. Each row links to
 * the catalogue filtered by that category, which is the only useful action here.
 */
export function CategoryBreakdown({ categories }: Props) {
  if (categories.length === 0) {
    return (
      <div className="border-border/60 text-muted-foreground grid h-[120px] place-items-center rounded-lg border border-dashed text-[12px]">
        Your scores will group by category once you finish an attempt.
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {categories.map((category) => (
        <li key={category.categoryId} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <Link
              href={`/student/quizzes?categoryId=${category.categoryId}`}
              className="hover:text-primary truncate text-[12.5px] font-medium transition-colors"
            >
              {category.categoryName}
            </Link>
            <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
              {percentLabel(category.averagePercentage)}
            </span>
          </div>

          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={cn('h-full rounded-full', barTone(category.averagePercentage))}
              style={{ width: `${categoryBarWidth(category.averagePercentage)}%` }}
            />
          </div>

          <p className="text-muted-foreground text-[10.5px]">{categoryCaption(category)}</p>
        </li>
      ))}
    </ul>
  );
}
