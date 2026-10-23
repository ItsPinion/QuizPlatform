import type { AdminAnalytics } from '@quiz/shared/analytics';
import { ratioSlices } from '@quiz/shared/analytics';

import { outcomeLabel, outcomeTone } from '@/lib/analytics-params';
import { cn } from '@/lib/utils';

interface Props {
  attempts: AdminAnalytics['attempts'];
}

/**
 * The pass / fail split.
 *
 * A single stacked bar rather than a donut: it reads at a glance, needs no SVG
 * trigonometry, and the legend underneath carries the exact counts. Expired
 * attempts get their own slice, so an abandoned paper is not counted as a
 * failure — the pass rate printed here is passed / (passed + failed).
 */
export function PassFailChart({ attempts }: Props) {
  const slices = ratioSlices(attempts.passed, attempts.failed, attempts.expired);
  const graded = attempts.passed + attempts.failed + attempts.expired;

  if (graded === 0) {
    return (
      <div className="border-border/60 text-muted-foreground grid h-[72px] place-items-center rounded-lg border border-dashed text-[12px]">
        No graded attempts yet — the split appears after the first submission.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="bg-muted/60 flex h-3 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`${attempts.passed} passed, ${attempts.failed} failed, ${attempts.expired} expired`}
      >
        {slices
          .filter((slice) => slice.count > 0)
          .map((slice) => (
            <div
              key={slice.kind}
              className={cn('h-full', outcomeTone(slice.kind))}
              style={{ width: `${slice.percentage}%` }}
            />
          ))}
      </div>

      <dl className="grid gap-2 text-[12px] sm:grid-cols-3">
        {slices.map((slice) => (
          <div key={slice.kind} className="flex items-center justify-between gap-2 sm:block">
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <span className={cn('inline-block size-2 rounded-full', outcomeTone(slice.kind))} />
              {outcomeLabel(slice.kind)}
            </dt>
            <dd className="font-mono tabular-nums sm:mt-0.5">
              {slice.count}
              <span className="text-muted-foreground/70"> · {slice.percentage}%</span>
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-muted-foreground text-[11px]">
        {attempts.passRate == null
          ? 'No finished attempts yet'
          : `Pass rate ${Number(attempts.passRate.toFixed(1))}% over ${graded} finished attempt${
              graded === 1 ? '' : 's'
            }`}
        {attempts.inProgress > 0
          ? ` · ${attempts.inProgress} still in progress, excluded from every rate`
          : ''}
        .
      </p>
    </div>
  );
}
