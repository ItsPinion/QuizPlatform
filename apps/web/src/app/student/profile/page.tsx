import type { StudentProfileResponse } from '@quiz/shared/admin-attempts';
import {
  Award,
  CalendarDays,
  Clock,
  Gauge,
  ListChecks,
  Mail,
  ShieldCheck,
  Target,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/cinema/page-header';
import { ChangePasswordForm } from '@/components/change-password-form';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { historyTone, historyWhen } from '@/lib/review-params';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Your profile — QuizPlatform',
  description:
    'Your account, your average, the categories you are strong in and every paper you have sat.',
};

/**
 * The student's own record.
 *
 * It is deliberately the *same* payload the admin console reads for one student
 * (`GET /api/student/profile` and `GET /api/admin/users/:id/profile` share one
 * builder), so a student and a teacher can never disagree about the numbers.
 *
 * The page answers three questions in the order they get asked:
 *
 * 1. **Who am I signed in as, and since when?** — the account card, and the way
 *    to change the password without going through the "forgot" email loop.
 * 2. **How am I doing?** — averages and accuracy, not a scoreboard of one day.
 * 3. **What exactly have I sat?** — every attempt, newest first, each row
 *    opening the paper it came from.
 *
 * Everything is server-rendered: there is no loading state, and the numbers are
 * the ones the grader wrote, not the ones a browser remembered.
 */
export default async function StudentProfilePage() {
  const decision = decideAccess(await getSession(), 'STUDENT', '/student/profile');
  if (!decision.allowed) redirect(decision.redirectTo);

  const api = await serverApi();
  const res = await api.api.student.profile.$get();
  if (!res.ok) redirect('/login?next=/student/profile');

  const { profile } = (await res.json()) as StudentProfileResponse;
  const { user, stats, categories, history } = profile;

  const accuracy =
    stats.questionsAnswered > 0
      ? Math.round((stats.questionsCorrect / stats.questionsAnswered) * 100)
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        label="Your account"
        title={user.name}
        description="Everything the grader knows about your work, and the two settings that belong to you."
        aside={
          <>
            <Badge variant="outline">{user.role}</Badge>
            <Badge variant={user.status === 'ACTIVE' ? 'success' : 'destructive'}>
              {user.status}
            </Badge>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Account</CardTitle>
            <CardDescription className="text-[11.5px]">
              What the platform holds for you. Only an administrator can change the name or the
              email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            {[
              { icon: UserRound, label: 'Name', value: user.name },
              { icon: Mail, label: 'Email', value: user.email },
              {
                icon: CalendarDays,
                label: 'Joined',
                value: new Date(user.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }),
              },
              {
                icon: ListChecks,
                label: 'Quizzes attempted',
                value: `${stats.quizzesAttempted}`,
              },
              { icon: Award, label: 'Certificates earned', value: `${stats.certificates}` },
            ].map((row) => (
              <div
                key={row.label}
                className="border-border/50 flex items-center justify-between gap-4 border-b pb-2.5 last:border-0 last:pb-0"
              >
                <span className="text-muted-foreground inline-flex items-center gap-2">
                  <row.icon aria-hidden className="size-3.5" />
                  {row.label}
                </span>
                <span className="min-w-0 truncate text-right font-medium">{row.value}</span>
              </div>
            ))}

            <p className="text-muted-foreground flex items-start gap-2 pt-1 text-[11.5px] leading-relaxed">
              <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Your password is stored as a hash. Nobody — not even an administrator — can read it,
              which is why a forgotten one is reset by link rather than recovered.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Password</CardTitle>
            <CardDescription className="text-[11.5px]">
              Change it from here. Any reset link you asked for is cancelled the moment this
              succeeds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="performance" className="space-y-4">
        <div>
          <h2 id="performance" className="font-display text-xl font-light tracking-tight">
            Performance
          </h2>
          <p className="text-muted-foreground mt-1 text-[12.5px]">
            Across every graded paper. A paper still in progress is counted as an attempt, not as a
            result.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Attempts"
            value={stats.attempts}
            hint={`${stats.completed} graded · ${stats.inProgress} running`}
            icon={Target}
          />
          <StatCard
            label="Average"
            value={`${stats.averagePercentage}%`}
            hint={accuracy == null ? 'No answers yet' : `${accuracy}% of answers correct`}
            icon={Gauge}
            tone={stats.averagePercentage >= 60 ? 'success' : 'warning'}
          />
          <StatCard
            label="Best"
            value={stats.bestPercentage == null ? '—' : `${stats.bestPercentage}%`}
            hint={stats.worstPercentage == null ? undefined : `lowest ${stats.worstPercentage}%`}
            icon={TrendingUp}
            tone="success"
          />
          <StatCard
            label="Time on papers"
            value={`${Math.round(stats.timeSpentSeconds / 60)}m`}
            hint={`${stats.passed} passed · ${stats.failed} failed`}
            icon={Clock}
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">By category</CardTitle>
            <CardDescription className="text-[11.5px]">
              Your average per subject — the shortest path to knowing what to revise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-[12.5px]">
                No graded attempts yet. Your first result will fill this in.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {categories.map((category) => (
                  <li key={category.categoryId} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-[12.5px]">
                      <Link
                        href={`/student/quizzes?categoryId=${encodeURIComponent(category.categoryId)}`}
                        className="truncate underline-offset-4 hover:underline"
                      >
                        {category.categoryName}
                      </Link>
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {category.averagePercentage}% · {category.attempts}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${category.categoryName} average`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(category.averagePercentage)}
                      className="bg-secondary h-1.5 overflow-hidden rounded-full"
                    >
                      <div
                        className={cn(
                          'h-full rounded-full',
                          category.averagePercentage >= 60 ? 'bg-success' : 'bg-warning',
                        )}
                        style={{ width: `${Math.min(100, category.averagePercentage)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="history" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="history" className="font-display text-xl font-light tracking-tight">
              Every attempt
            </h2>
            <p className="text-muted-foreground mt-1 text-[12.5px]">
              Newest first. A finished paper opens its answer key.
            </p>
          </div>
          <Link
            href="/student/results"
            className="text-muted-foreground hover:text-foreground text-[12.5px] underline-offset-4 hover:underline"
          >
            Filter and sort in Results →
          </Link>
        </div>

        <Card>
          <CardContent className="px-0">
            {history.length === 0 ? (
              <p className="text-muted-foreground px-6 py-10 text-center text-[12.5px]">
                You have not sat a quiz yet.{' '}
                <Link href="/student/quizzes" className="underline underline-offset-4">
                  Browse the catalogue
                </Link>
                .
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[660px] text-[13px]">
                  <caption className="sr-only">
                    Your attempts, newest first, with status, score and date
                  </caption>
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground border-border/70 border-y text-left text-[11px] tracking-wider uppercase">
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Quiz
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">
                        Score
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        When
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border/60 divide-y">
                    {history.map((entry) => (
                      <tr key={entry.id} className="hover:bg-accent/25 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="max-w-[26ch] truncate">{entry.quizTitle}</p>
                          <p className="text-muted-foreground text-[11px]">{entry.categoryName}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={historyTone(entry.status)} className="text-[10px]">
                            {entry.status === 'IN_PROGRESS' ? 'In progress' : entry.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{entry.percentage}%</td>
                        <td className="text-muted-foreground px-3 py-2.5 text-[12px]">
                          {historyWhen(entry.completedAt ?? entry.startedAt)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link
                            href={
                              entry.status === 'IN_PROGRESS'
                                ? `/student/attempt/${entry.id}`
                                : `/student/attempt/${entry.id}/review`
                            }
                            className="text-[12px] underline-offset-4 hover:underline"
                          >
                            {entry.status === 'IN_PROGRESS' ? 'Resume' : 'Review'}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
