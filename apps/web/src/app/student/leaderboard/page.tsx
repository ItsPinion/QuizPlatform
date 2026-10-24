import type { LeaderboardResponse } from '@quiz/shared/leaderboard';

import { PageHeader } from '@/components/cinema/page-header';
import { Award, Medal, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LeaderboardBoard } from '@/components/leaderboard-board';
import { LeaderboardPodium } from '@/components/leaderboard-podium';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import {
  currentUserCaption,
  leaderboardHref,
  metricLabel,
  metricShortLabel,
  metricValueLabel,
  participantsLabel,
  parseLeaderboardFilters,
  periodLabel,
  toLeaderboardQuery,
} from '@/lib/leaderboard-params';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Leaderboard — Student' };

const METRICS = ['average', 'best', 'completed'] as const;
const PERIODS = ['all', 'month', 'week'] as const;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const decision = decideAccess(await getSession(), 'STUDENT', '/student/leaderboard');
  if (!decision.allowed) redirect(decision.redirectTo);

  const filters = parseLeaderboardFilters(await searchParams);

  let board: LeaderboardResponse | null = null;

  try {
    const api = await serverApi();
    const boardRes = await api.api.leaderboard.$get({ query: toLeaderboardQuery(filters) });

    if (boardRes.ok) board = await boardRes.json();
  } catch {
    board = null;
  }

  // Straight from the response — no hard-coded list, so a category an admin adds
  // is on this screen the next time it loads. A category with no graded paper
  // stays selectable (it has an empty state) but is visibly quiet.
  const categories = board?.categories ?? [];

  const me = board?.currentUser ?? null;
  const scopeName = board?.scope.categoryName ?? 'Overall';

  return (
    <div className="space-y-7">
      <PageHeader
        label="Student · standings"
        title="Leaderboard"
        description={
          <>
            Ranked by {metricLabel(filters.metric).toLowerCase()} over {scopeName.toLowerCase()}.
            Only finished attempts count — a paper still in progress has no score to rank.
          </>
        }
        aside={
          <>
            <Badge variant="outline" className="hidden gap-1.5 sm:inline-flex">
              <ShieldCheck />
              STUDENT
            </Badge>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Day 12 · leaderboard
            </Badge>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Ranking metric" className="flex flex-wrap gap-1.5">
          {METRICS.map((metric) => (
            <Link
              key={metric}
              href={leaderboardHref(filters, { metric })}
              aria-current={metric === filters.metric ? 'true' : undefined}
              className={cn(
                buttonVariants({
                  variant: metric === filters.metric ? 'default' : 'outline',
                  size: 'sm',
                }),
                'text-[12px]',
              )}
            >
              {metricShortLabel(metric)}
            </Link>
          ))}

          <span className="bg-border mx-1 hidden w-px sm:block" aria-hidden="true" />

          {PERIODS.map((period) => (
            <Link
              key={period}
              href={leaderboardHref(filters, { period })}
              aria-current={period === filters.period ? 'true' : undefined}
              className={cn(
                buttonVariants({
                  variant: period === filters.period ? 'default' : 'outline',
                  size: 'sm',
                }),
                'text-[12px]',
              )}
            >
              {periodLabel(period)}
            </Link>
          ))}
        </nav>

        {categories.length > 0 ? (
          <nav aria-label="Leaderboard category" className="flex flex-wrap gap-1.5">
            <Link
              href={leaderboardHref(filters, { categoryId: '' })}
              aria-current={filters.categoryId === '' ? 'true' : undefined}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                filters.categoryId === ''
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/60 text-muted-foreground hover:text-foreground',
              )}
            >
              All categories
            </Link>
            {categories.map((category) => (
              <Link
                key={category.id}
                href={leaderboardHref(filters, { categoryId: category.id })}
                aria-current={filters.categoryId === category.id ? 'true' : undefined}
                title={
                  category.attempts === 0
                    ? `${category.name} — no graded attempts yet`
                    : `${category.name} — ${category.attempts} graded attempt${category.attempts === 1 ? '' : 's'}`
                }
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                  filters.categoryId === category.id
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : category.attempts === 0
                      ? 'border-border/60 text-muted-foreground/60 hover:text-foreground'
                      : 'border-border/60 text-muted-foreground hover:text-foreground',
                )}
              >
                {category.name}
              </Link>
            ))}
          </nav>
        ) : null}

        <p className="text-muted-foreground text-[11.5px]">
          {board ? participantsLabel(board.totals.participants) : 'The board could not be loaded'} ·{' '}
          {periodLabel(filters.period).toLowerCase()} · {scopeName}
          {board ? ` · ${board.totals.quizzes} quizzes represented` : ''}
        </p>
      </div>

      {board === null ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">The leaderboard is unavailable</CardTitle>
            <CardDescription>
              The web app could not reach the API. Your results are unaffected — this screen only
              reads them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/student/results"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              Back to your results
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <section aria-label="Your position">
            <Card
              className={cn('gap-3', me?.rank === 1 ? 'border-warning/40 bg-warning/5' : undefined)}
            >
              <CardHeader className="pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Trophy className="text-warning size-4" />
                    Your position
                  </CardTitle>
                  {me ? (
                    <span className="text-muted-foreground font-mono text-[11.5px] tabular-nums">
                      {currentUserCaption(me.rank, board.totals.participants)}
                    </span>
                  ) : null}
                </div>
              </CardHeader>

              <CardContent>
                {me ? (
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <div className="cine-label text-[9px] text-gray-400">Rank</div>
                      <div className="text-xl font-semibold tabular-nums">#{me.rank}</div>
                    </div>
                    <div>
                      <div className="cine-label text-[9px] text-gray-400">
                        {metricLabel(filters.metric)}
                      </div>
                      <div className="text-xl font-semibold tabular-nums">
                        {metricValueLabel(me, filters.metric)}
                      </div>
                    </div>
                    <div>
                      <div className="cine-label text-[9px] text-gray-400">Attempts</div>
                      <div className="font-mono text-[13px] tabular-nums">
                        {me.attempts} finished · {me.quizzesCompleted} quiz
                        {me.quizzesCompleted === 1 ? '' : 'zes'}
                      </div>
                    </div>
                    <div>
                      <div className="cine-label text-[9px] text-gray-400">Pass rate</div>
                      <div className="font-mono text-[13px] tabular-nums">
                        {me.passRate == null ? '—' : `${Number(me.passRate.toFixed(1))}%`}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-[12.5px]">
                      You are not on this board yet — finish a quiz and your average appears here.
                    </p>
                    <Link
                      href="/student/quizzes"
                      className={cn(buttonVariants({ size: 'sm' }), 'text-[12px]')}
                    >
                      Browse quizzes
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <LeaderboardPodium entries={board.entries} metric={board.metric} />

          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Award className="text-primary size-4" />
                  {scopeName} · {metricLabel(board.metric)}
                </CardTitle>
                <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                  <Sparkles className="size-3" />
                  {periodLabel(board.period)}
                </span>
              </div>
              <CardDescription className="text-[11.5px]">
                Ties share a rank. The gap column reads in the metric&apos;s own units.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LeaderboardBoard entries={board.entries} metric={board.metric} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Medal className="text-muted-foreground size-4" />
                How ranking works
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground grid gap-3 text-[12px] sm:grid-cols-3">
              <p>
                <span className="text-foreground font-medium">Attempts:</span> only{' '}
                <code className="bg-muted rounded px-1">PASSED</code> and{' '}
                <code className="bg-muted rounded px-1">FAILED</code> papers rank. A live attempt
                has no score yet.
              </p>
              <p>
                <span className="text-foreground font-medium">Ties:</span> equal values share a rank
                and the next place skips the numbers the tie used (1, 2, 2, 4).
              </p>
              <p>
                <span className="text-foreground font-medium">Periods</span> are rolling windows:
                this month is the last 30 days, this week the last 7, measured from each
                paper&apos;s completion time.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
