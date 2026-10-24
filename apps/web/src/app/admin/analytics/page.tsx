import type { AdminAnalytics } from '@quiz/shared/analytics';

import { BuildBadge } from '@/components/build-badge';
import { PageHeader } from '@/components/cinema/page-header';
import { percentChange } from '@quiz/shared/analytics';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Database,
  GraduationCap,
  Percent,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AnalyticsTimeline } from '@/components/analytics-timeline';
import { CategoryPopularity } from '@/components/category-popularity';
import { PassFailChart } from '@/components/pass-fail-chart';
import { QuizPerformanceChart } from '@/components/quiz-performance-chart';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  WINDOW_OPTIONS,
  analyticsWindow,
  changeLabel,
  changeTone,
  windowHref,
  windowLabel,
} from '@/lib/analytics-params';
import { serverApi } from '@/lib/api-server';
import { durationLabel, percentLabel } from '@/lib/dashboard-params';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Analytics — Admin console' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminAnalyticsPage({ searchParams }: PageProps) {
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin/analytics');
  if (!decision.allowed) redirect(decision.redirectTo);

  const days = analyticsWindow(await searchParams);

  let analytics: AdminAnalytics | null = null;
  try {
    const res = await (
      await serverApi()
    ).api.admin.analytics.$get({
      query: { days: String(days) },
    });
    if (res.ok) analytics = await res.json();
  } catch {
    // API down or database unconfigured — the page explains itself below.
    analytics = null;
  }

  if (analytics === null) {
    return (
      <div className="space-y-6">
        <PageHeader
          label="Admin console · analytics"
          title="Analytics"
          aside={
            <>
              <Badge variant="warning" className="gap-1.5">
                <ShieldCheck />
                ADMIN
              </Badge>
              <BuildBadge>Day 11 · analytics</BuildBadge>
            </>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="text-warning size-4" />
              Analytics are unavailable
            </CardTitle>
            <CardDescription>
              The web app could not reach the API, or the API could not read the database. The
              console is still guarded — this is a data problem, not an access problem.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            <p className="text-muted-foreground">
              Check <code className="bg-muted rounded px-1">/api/health/db</code> first: it reports
              the connection target and row counts.
            </p>
            <a
              href="/api/health/db"
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              Open the database probe
              <ArrowRight />
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const attemptChange = percentChange(
    analytics.attempts.inWindow,
    analytics.attempts.inPreviousWindow,
  );
  const studentChange = percentChange(
    analytics.students.newInWindow,
    analytics.students.newInPreviousWindow,
  );
  const timelineAttempts = analytics.timeline.reduce((sum, point) => sum + point.attempts, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        label="Admin console · analytics"
        title="Analytics"
        description={
          <>
            Every figure comes from{' '}
            <code className="rounded bg-white/8 px-1 py-0.5 font-mono text-[12px]">
              GET /api/admin/analytics
            </code>{' '}
            in one round trip — aggregates over the whole platform, never a number added up in the
            browser.
          </>
        }
        aside={
          <>
            <Badge variant="warning" className="hidden gap-1.5 sm:inline-flex">
              <ShieldCheck />
              ADMIN
            </Badge>
            <nav aria-label="Analytics window" className="flex flex-wrap gap-1.5">
              {WINDOW_OPTIONS.map((option) => (
                <Link
                  key={option}
                  href={windowHref(option)}
                  aria-current={option === days ? 'true' : undefined}
                  className={cn(
                    buttonVariants({
                      variant: option === days ? 'default' : 'outline',
                      size: 'sm',
                    }),
                    'h-9 rounded-full px-4 font-mono text-[11px]',
                  )}
                >
                  {option}d
                </Link>
              ))}
            </nav>
          </>
        }
      />

      <p className="text-[11px] tracking-[0.14em] text-gray-400 uppercase">
        {windowLabel(days)} · {timelineAttempts} attempt{timelineAttempts === 1 ? '' : 's'} ·{' '}
        <span className={changeTone(attemptChange)}>{changeLabel(attemptChange, days)}</span>
      </p>

      <section
        aria-label="Platform statistics"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        <StatCard
          label="Students"
          value={analytics.students.total}
          hint={`${analytics.students.active} active · ${analytics.students.newInWindow} joined in ${windowLabel(days).toLowerCase()}`}
          icon={Users}
        />
        <StatCard
          label="Active learners"
          value={analytics.students.activeLearners}
          hint={
            analytics.students.attemptsPerLearner == null
              ? 'No attempts yet'
              : `${analytics.students.attemptsPerLearner} attempts per learner`
          }
          icon={GraduationCap}
          tone="primary"
        />
        <StatCard
          label="Attempts"
          value={analytics.attempts.total}
          hint={`${analytics.attempts.inProgress} in progress · ${analytics.attempts.graded} graded`}
          icon={BarChart3}
        />
        <StatCard
          label="Pass rate"
          value={percentLabel(analytics.attempts.passRate)}
          hint={`${analytics.attempts.passed} passed · ${analytics.attempts.failed} failed · ${analytics.attempts.expired} expired`}
          icon={Percent}
          tone={
            analytics.attempts.passRate != null && analytics.attempts.passRate >= 60
              ? 'success'
              : 'warning'
          }
        />
        <StatCard
          label="Average score"
          value={percentLabel(analytics.attempts.averagePercentage)}
          hint={
            analytics.attempts.accuracy == null
              ? 'No questions answered yet'
              : `${percentLabel(analytics.attempts.accuracy)} answer accuracy`
          }
          icon={Target}
        />
        <StatCard
          label="Quizzes"
          value={analytics.quizzes.total}
          hint={`${analytics.quizzes.published} published · ${analytics.quizzes.questions} questions · ${analytics.quizzes.neverAttempted} never attempted`}
          icon={BookOpen}
        />
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="text-primary size-4" />
              Attempts over time
            </CardTitle>
            <CardDescription className="text-[11.5px]">
              Bars are attempts started per day; the line is student registrations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnalyticsTimeline points={analytics.timeline} days={analytics.windowDays} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pass / fail</CardTitle>
            <CardDescription className="text-[11.5px]">
              Finished attempts only — a live paper is not a verdict.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PassFailChart attempts={analytics.attempts} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Most popular quizzes</CardTitle>
            <CardDescription className="text-[11.5px]">
              Ordered by attempts; the bar is the average score, the caption the pass rate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuizPerformanceChart rows={analytics.quizPerformance} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Most popular categories</CardTitle>
            <CardDescription className="text-[11.5px]">
              Share of attempted quizzes, with the average score per category.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryPopularity rows={analytics.categories} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">How these numbers are defined</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground grid gap-3 text-[12px] sm:grid-cols-2">
          <p>
            <span className="text-foreground font-medium">Pass rate</span> is passed / (passed +
            failed). Expired attempts are their own slice: nobody submitted them, so calling them a
            failure would overstate the failure rate.
          </p>
          <p>
            <span className="text-foreground font-medium">Averages</span> ignore attempts still in
            progress — their stored percentage is a zero that was never earned. A paper whose
            deadline passed is settled by the same expiry sweep the student screens use, before this
            page counts anything.
          </p>
          <p>
            <span className="text-foreground font-medium">Time</span>: the platform has logged{' '}
            {analytics.attempts.averageTimeSeconds == null
              ? 'no time'
              : durationLabel(analytics.attempts.averageTimeSeconds)}{' '}
            on average per graded attempt, and {analytics.attempts.questionsAnswered} answers in
            total.
          </p>
          <p>
            <span className="text-foreground font-medium">Registrations</span> are students only,
            grouped by UTC day; new students in {windowLabel(days).toLowerCase()}:{' '}
            <span className={changeTone(studentChange)}>{analytics.students.newInWindow}</span> (
            {changeLabel(studentChange, days).toLowerCase()}).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
