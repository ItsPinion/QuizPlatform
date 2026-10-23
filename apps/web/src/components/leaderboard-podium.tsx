import type { LeaderboardEntryWire, LeaderboardMetric } from '@quiz/shared/leaderboard';
import { Crown } from 'lucide-react';

import { metricValueLabel, ordinal, rankTone } from '@/lib/leaderboard-params';
import { cn } from '@/lib/utils';

interface Props {
  entries: readonly LeaderboardEntryWire[];
  metric: LeaderboardMetric;
}

const TONES = [
  'border-warning/40 bg-warning/5',
  'border-border/70 bg-card/60',
  'border-primary/30 bg-primary/5',
];

/**
 * The top three, as cards.
 *
 * The table below already lists them; this is the part a student reads first.
 * Cards rather than a literal podium so the same component works for a board of
 * two (a brand-new install) without a staircase of empty steps.
 */
export function LeaderboardPodium({ entries, metric }: Props) {
  const top = entries.slice(0, 3);

  if (top.length === 0) return null;

  return (
    <ul className="grid gap-2.5 sm:grid-cols-3">
      {top.map((entry, index) => (
        <li
          key={entry.userId}
          className={cn(
            'rounded-xl border p-3.5',
            TONES[index] ?? 'border-border/60 bg-card/60',
            entry.isCurrentUser && 'ring-primary/30 ring-1',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className={cn('font-mono text-[11px] font-semibold', rankTone(entry.rank))}>
              {ordinal(entry.rank)}
            </span>
            {entry.rank === 1 ? <Crown className={cn('size-3.5', rankTone(1))} /> : null}
          </div>

          <p className="mt-1.5 truncate text-[13px] font-medium">
            {entry.name}
            {entry.isCurrentUser ? (
              <span className="text-primary ml-1 text-[10px] font-normal">(you)</span>
            ) : null}
          </p>

          <p className="text-lg font-semibold tabular-nums">{metricValueLabel(entry, metric)}</p>
          <p className="text-muted-foreground text-[10.5px]">
            {entry.quizzesCompleted} quiz{entry.quizzesCompleted === 1 ? '' : 'zes'} ·{' '}
            {entry.attempts} attempt{entry.attempts === 1 ? '' : 's'}
          </p>
        </li>
      ))}
    </ul>
  );
}
