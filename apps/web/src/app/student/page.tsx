import type { StudentQuizListResponse } from '@quiz/shared/attempt';
import type { StudentDashboard } from '@quiz/shared/dashboard';
import {
  ArrowRight,
  ChartNoAxesCombined,
  CirclePlay,
  Clock,
  Flame,
  ListChecks,
  Target,
  Timer,
  Trophy,
  UserRound,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ActivityChart } from '@/components/activity-chart';
import { CategoryBreakdown } from '@/components/category-breakdown';
import { ScoreTrendChart } from '@/components/score-trend-chart';
import { StudentQuizCard } from '@/components/student-quiz-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import {
  attemptsCaption,
  coverageLabel,
  durationLabel,
  passRateLabel,
  percentLabel,
  toneFor,
} from '@/lib/dashboard-params';
import { decideAccess } from '@/lib/guards';
import { historyTone, historyWhen } from '@/lib/review-params';
import { getSession } from '@/lib/session';
import { formatPercentage } from '@/lib/student-params';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Student dashboard — QuizPlatform',
  description: 'Your quiz statistics, performance trend, category strengths and recent attempts.',
};

/**
 * Student dashboard.
 *
 * Every number here comes from `GET /api/student/dashboard`, which computes it
 * from the attempt rows the Day 8 grader wrote — the page does no arithmetic of
 * its own beyond formatting. The catalogue call rides along for the "resume"
 * banner and the suggestions at the bottom.
 */
export default async function StudentPage() {
  const decision = decideAccess(await getSession(), 'STUDENT', '/student');
  if (!decision.allowed) redirect(decision.redirectTo);

  const { session } = decision;

  let dashboard: StudentDashboard | null = null;
  let catalogue: StudentQuizListResponse | null = null;

  try {
    const api = await serverApi();
    const [dashboardRes, catalogueRes] = await Promise.all([
      api.api.student.dashboard.$get(),
      api.api.student.quizzes.$get({ query: { pageSize: '24' } }),
    ]);

    if (dashboardRes.ok) dashboard = await dashboardRes.json();
    if (catalogueRes.ok) catalogue = await catalogueRes.json();
  } catch {
    dashboard = null;
  }

  const quizzes = catalogue?.quizzes ?? [];
  const live = quizzes.filter((quiz) => quiz.inProgressAttemptId);
  const toTry = quizzes
    .filter((quiz) => quiz.attemptsRemaining > 0 || quiz.inProgressAttemptId)
    .slice(0, 3);

  const totals = dashboard?.totals;
  const passMark = 60;

  const stats = [
    {
      label: 'Quizzes attempted',
      value: totals ? String(totals.quizzesAttempted) : '—',
      caption: totals ? coverageLabel(totals.quizzesAttempted, totals.quizzesAvailable) : '—',
      icon: ListChecks,
      tone: 'text-foreground',
    },
    {
      label: 'Passed',
      value: totals ? String(totals.passed) : '—',
      caption: totals ? `of ${totals.passed + totals.failed} graded` : '—',
      icon: Trophy,
      tone: totals ? 'text-success' : 'text-foreground',
    },
    {
      label: 'Failed',
      value: totals ? String(totals.failed) : '—',
      caption: totals ? passRateLabel(totals.passRate) + ' pass rate' : '—',
      icon: Target,
      tone: totals?.failed ? 'text-destructive' : 'text-foreground',
    },
    {
      label: 'Average score',
      value: totals ? percentLabel(totals.averagePercentage) : '—',
      caption: totals?.accuracy != null ? `${percentLabel(totals.accuracy)} answer accuracy` : '—',
      icon: ChartNoAxesCombined,
      tone: toneFor(totals?.averagePercentage ?? null, passMark),
    },
    {
      label: 'Highest score',
      value: totals ? percentLabel(totals.bestPercentage) : '—',
      caption:
        totals?.worstPercentage != null ? `low ${percentLabel(totals.worstPercentage)}` : '—',
      icon: Trophy,
      tone: toneFor(totals?.bestPercentage ?? null, passMark),
    },
    {
      label: 'Questions answered',
      value: totals ? String(totals.questionsAnswered) : '—',
      caption: totals ? `${totals.questionsCorrect} correct` : '—',
      icon: ListChecks,
      tone: 'text-foreground',
    },
    {
      label: 'Time on quizzes',
      value: totals ? durationLabel(totals.timeSpentSeconds) : '—',
      caption:
        totals?.averageTimeSeconds != null
          ? `${durationLabel(totals.averageTimeSeconds)} avg`
          : '—',
      icon: Timer,
      tone: 'text-foreground',
    },
    {
      label: 'Best streak',
      value: dashboard ? String(dashboard.streak.best) : '—',
      caption: dashboard ? `${dashboard.streak.current} current` : '—',
      icon: Flame,
      tone: dashboard?.streak.current ? 'text-warning' : 'text-foreground',
    },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="gap-1.5">
            <UserRound className="size-3" />
            STUDENT
          </Badge>
          <Badge variant="outline">Day 10 · dashboard</Badge>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          Hello, {session.user.name.split(' ')[0]}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Your scores, your habits, your weak spots — all read from the attempts the server graded.
          Nothing here is computed in the browser.
        </p>
      </header>

      {live.length > 0 ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="text-warning size-4" />
              An attempt is still running
            </CardTitle>
            <CardDescription>
              The deadline keeps counting while you are away. Pick it up where you left off.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px]">{live[0]?.title}</span>
            <Link
              href={`/student/attempt/${live[0]?.inProgressAttemptId}`}
              className={buttonVariants({ size: 'sm' })}
            >
              <CirclePlay />
              Resume attempt
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-medium">Statistics</h2>
          {totals ? (
            <span className="text-muted-foreground text-[11.5px]">{attemptsCaption(totals)}</span>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="py-4">
              <CardContent className="space-y-1">
                <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] tracking-wider uppercase">
                  <stat.icon className="size-3.5" />
                  {stat.label}
                </p>
                <p className={cn('text-2xl font-semibold tabular-nums', stat.tone)}>{stat.value}</p>
                <p className="text-muted-foreground text-[11px]">{stat.caption}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Score trend</CardTitle>
            <CardDescription className="text-[11.5px]">
              Your last twelve graded attempts, oldest first. The dashed line is the pass mark.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard ? (
              <ScoreTrendChart trend={dashboard.trend} passMark={passMark} />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-[12.5px]">
                The dashboard could not be loaded. Check the API on port 3001.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Activity</CardTitle>
            <CardDescription className="text-[11.5px]">
              Attempts per day, last 14 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard ? (
              <ActivityChart days={dashboard.activity} />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-[12.5px]">No data.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">By category</CardTitle>
            <CardDescription className="text-[11.5px]">
              Average score per category — click one to browse it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBreakdown categories={dashboard?.categories ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
            <div className="space-y-1">
              <CardTitle className="text-sm">Recent attempts</CardTitle>
              <CardDescription className="text-[11.5px]">
                The five most recent papers and what they scored.
              </CardDescription>
            </div>
            <Link
              href="/student/results"
              className="text-primary inline-flex shrink-0 items-center gap-1 text-[12px] hover:underline"
            >
              All results <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {dashboard && dashboard.recent.length > 0 ? (
              <ul className="divide-border/60 -mx-1 divide-y">
                {dashboard.recent.map((attempt) => (
                  <li key={attempt.id} className="flex items-center gap-2 px-1 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{attempt.quizTitle}</p>
                      <p className="text-muted-foreground text-[10.5px]">
                        {historyWhen(attempt.completedAt ?? attempt.startedAt)}
                        {attempt.inProgress ? ' · still running' : ''}
                      </p>
                    </div>

                    <Badge variant={historyTone(attempt.status)} className="text-[9.5px]">
                      {attempt.inProgress ? 'In progress' : formatPercentage(attempt.percentage)}
                    </Badge>

                    <Link
                      href={
                        attempt.inProgress
                          ? `/student/attempt/${attempt.id}`
                          : `/student/attempt/${attempt.id}/review`
                      }
                      className="text-muted-foreground hover:text-foreground shrink-0 text-[11px] underline underline-offset-2"
                    >
                      {attempt.inProgress ? 'Resume' : 'Review'}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground py-6 text-center text-[12px]">
                No attempts yet — your first one shows up here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-medium">Ready when you are</h2>
          <Link
            href="/student/quizzes"
            className="text-primary inline-flex items-center gap-1 text-[12.5px] hover:underline"
          >
            Browse all quizzes <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {toTry.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-8 text-center text-[13px]">
              {catalogue
                ? 'You have used every attempt available to you.'
                : 'The quiz catalogue could not be loaded.'}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {toTry.map((quiz) => (
              <StudentQuizCard key={quiz.id} quiz={quiz} />
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Your account</CardTitle>
          <CardDescription>Stored in the `users` table with a scrypt hash.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-[13px] sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground text-[11px] uppercase">Email</div>
            <div className="truncate font-mono text-[12px]">{session.user.email}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-[11px] uppercase">Status</div>
            <div className="font-mono text-[12px]">{session.user.status}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-[11px] uppercase">Member since</div>
            <div className="font-mono text-[12px]">
              {new Date(session.user.createdAt).toLocaleDateString(undefined, {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
