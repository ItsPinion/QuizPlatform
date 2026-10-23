import type { LeaderboardEntryWire, LeaderboardMetric } from '@quiz/shared/leaderboard';

import {
  boardSummary,
  gapLabel,
  metricValueLabel,
  ordinal,
  rankTone,
} from '@/lib/leaderboard-params';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  entries: readonly LeaderboardEntryWire[];
  metric: LeaderboardMetric;
}

/**
 * The ranked table.
 *
 * A real `<table>`: a leaderboard is tabular data, and a screen reader announcing
 * "rank, student, average score" beats a pile of divs. The metric column is the
 * one the board is ranked on; the other two are always visible so a row can be
 * read without changing the filter to compare it.
 */
export function LeaderboardBoard({ entries, metric }: Props) {
  if (entries.length === 0) {
    return (
      <div className="border-border/60 text-muted-foreground grid h-[160px] place-items-center rounded-lg border border-dashed text-[12.5px]">
        Nobody has finished a quiz on this board yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <caption className="sr-only">{boardSummary(entries, metric)}</caption>
        <thead>
          <tr className="text-muted-foreground border-border/60 border-b text-left text-[10.5px] tracking-wider uppercase">
            <th scope="col" className="py-2 pr-2 font-medium">
              Rank
            </th>
            <th scope="col" className="py-2 pr-2 font-medium">
              Student
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">
              {metric === 'completed' ? 'Completed' : metric === 'best' ? 'Best' : 'Average'}
            </th>
            <th scope="col" className="hidden py-2 pr-2 text-right font-medium sm:table-cell">
              Attempts
            </th>
            <th scope="col" className="hidden py-2 pr-2 text-right font-medium sm:table-cell">
              Pass rate
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Gap
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.userId}
              className={cn(
                'border-border/40 border-b last:border-0',
                entry.isCurrentUser && 'bg-primary/5',
              )}
            >
              <th scope="row" className="py-2.5 pr-2 text-left font-normal">
                <span className={cn('font-mono font-semibold tabular-nums', rankTone(entry.rank))}>
                  {entry.rank}
                </span>
                <span className="text-muted-foreground/70 ml-1 text-[10px]">
                  {ordinal(entry.rank)}
                </span>
              </th>

              <td className="max-w-[10rem] truncate py-2.5 pr-2">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{entry.name}</span>
                  {entry.isCurrentUser ? (
                    <Badge variant="outline" className="shrink-0 text-[9px]">
                      You
                    </Badge>
                  ) : null}
                </span>
              </td>

              <td className="py-2.5 pr-2 text-right font-mono tabular-nums">
                {metricValueLabel(entry, metric)}
              </td>
              <td className="text-muted-foreground hidden py-2.5 pr-2 text-right font-mono tabular-nums sm:table-cell">
                {entry.attempts}
              </td>
              <td className="text-muted-foreground hidden py-2.5 pr-2 text-right font-mono tabular-nums sm:table-cell">
                {entry.passRate == null ? '—' : `${Number(entry.passRate.toFixed(1))}%`}
              </td>
              <td className="text-muted-foreground py-2.5 text-right text-[11px]">
                {gapLabel(entry.gapToNext, entry.rank, metric)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
