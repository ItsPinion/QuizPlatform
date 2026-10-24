import type { AttemptHistoryResponse } from '@quiz/shared/review';

import { historyStatusLabel } from '@quiz/shared/review';
import { ArrowLeft, ArrowRight, Clock, Gauge, ListChecks, PlayCircle, Trophy } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BuildBadge } from '@/components/build-badge';
import { PageHeader } from '@/components/cinema/page-header';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import {
  historyHref,
  historyTone,
  historyWhen,
  parseHistoryFilters,
  toHistoryQuery,
} from '@/lib/review-params';
import { getSession } from '@/lib/session';
import { formatPercentage } from '@/lib/student-params';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Results — QuizPlatform',
  description: 'Every attempt you have taken, with its score and a per-question review.',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'PASSED', label: 'Passed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'IN_PROGRESS', label: 'In progress' },
] as const;

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'score', label: 'Best score' },
] as const;

/**
 * Attempt history.
 *
 * Server-rendered from `GET /api/student/attempts`, with the filters in the URL
 * so a view is shareable and a reload reproduces it. Every finished row links to
 * its review; a row that is still running links back into the attempt instead.
 */
export default async function ResultsPage({ searchParams }: PageProps) {
  const decision = decideAccess(await getSession(), 'STUDENT', '/student/results');
  if (!decision.allowed) redirect(decision.redirectTo);

  const filters = parseHistoryFilters(await searchParams);

  let data: AttemptHistoryResponse | null = null;

  try {
    const api = await serverApi();
    const res = await api.api.student.attempts.$get({ query: toHistoryQuery(filters) });
    if (res.ok) data = await res.json();
  } catch {
    data = null;
  }

  const attempts = data?.attempts ?? [];
  const totals = data?.totals;

  return (
    <div className="space-y-6">
      <PageHeader
        label="Student · the record"
        title="Your results"
        description="Every attempt, newest first. Open a finished one to walk the paper question by question — what you picked, what was right, and why."
        aside={<BuildBadge>Day 9 · results &amp; review</BuildBadge>}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Attempts', value: totals?.attempts ?? 0, icon: ListChecks },
          { label: 'Passed', value: totals?.passed ?? 0, icon: Trophy },
          { label: 'Failed', value: totals?.failed ?? 0, icon: Gauge },
          {
            label: 'Best score',
            value: totals?.bestPercentage == null ? '—' : formatPercentage(totals.bestPercentage),
            icon: Gauge,
          },
        ].map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((option) => {
          const active = filters.status === option.value;

          return (
            <Link
              key={option.label}
              href={historyHref({ status: option.value, sort: filters.sort })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors',
                active
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border/70 text-muted-foreground hover:bg-accent/50',
              )}
            >
              {option.label}
            </Link>
          );
        })}

        <span className="text-muted-foreground/60 mx-1 text-[11px]">·</span>

        {SORTS.map((option) => {
          const active = filters.sort === option.value;

          return (
            <Link
              key={option.value}
              href={historyHref({ status: filters.status, sort: option.value })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors',
                active
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border/70 text-muted-foreground hover:bg-accent/50',
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      {attempts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">No attempts here yet</CardTitle>
            <CardDescription>
              {filters.status || filters.quizId
                ? 'Nothing matches this filter.'
                : 'Take a quiz and it will show up here with its score and a full review.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/student/quizzes" className={cn(buttonVariants({ size: 'sm' }))}>
              Browse quizzes
              <ArrowRight />
            </Link>
            {filters.status || filters.quizId ? (
              <Link
                href="/student/results"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
              >
                Clear filters
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-border/60 divide-y">
            {attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="hover:bg-accent/30 flex flex-wrap items-center gap-3 px-4 py-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium">{attempt.quizTitle}</span>
                    <Badge variant={historyTone(attempt.status)} className="text-[10px]">
                      {historyStatusLabel(attempt)}
                    </Badge>
                    {attempt.autoSubmitted ? (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Clock className="size-2.5" />
                        auto
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
                    <span>{attempt.categoryName}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{historyWhen(attempt.completedAt ?? attempt.startedAt)}</span>
                    {attempt.inProgress ? null : (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="tabular-nums">
                          {attempt.correctAnswers} correct · {attempt.incorrectAnswers} incorrect ·{' '}
                          {attempt.unanswered} blank
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="text-right">
                  <p
                    className={cn(
                      'text-[15px] font-semibold tabular-nums',
                      attempt.inProgress
                        ? 'text-muted-foreground'
                        : attempt.passed
                          ? 'text-success'
                          : 'text-destructive',
                    )}
                  >
                    {attempt.inProgress ? '—' : formatPercentage(attempt.percentage)}
                  </p>
                  <p className="text-muted-foreground text-[10.5px] tabular-nums">
                    {attempt.inProgress
                      ? 'still running'
                      : `${attempt.score} / ${attempt.totalMarks} marks`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {attempt.inProgress ? (
                    <Link
                      href={`/student/attempt/${attempt.id}`}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                    >
                      <PlayCircle />
                      Resume
                    </Link>
                  ) : (
                    <>
                      <Link
                        href={`/student/attempt/${attempt.id}/review`}
                        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                      >
                        Review
                      </Link>
                      <Link
                        href={`/student/attempt/${attempt.id}`}
                        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                      >
                        Score
                      </Link>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && data.pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <Link
            href={historyHref({ ...filters, page: Math.max(1, filters.page - 1) })}
            aria-disabled={!data.pagination.hasPrev}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              !data.pagination.hasPrev && 'pointer-events-none opacity-50',
            )}
          >
            <ArrowLeft />
            Previous
          </Link>

          <span className="text-muted-foreground font-mono text-[11.5px]">
            page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total}{' '}
            attempt{data.pagination.total === 1 ? '' : 's'}
          </span>

          <Link
            href={historyHref({ ...filters, page: filters.page + 1 })}
            aria-disabled={!data.pagination.hasNext}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              !data.pagination.hasNext && 'pointer-events-none opacity-50',
            )}
          >
            Next
            <ArrowRight />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
