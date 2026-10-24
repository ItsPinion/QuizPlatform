import type { StudentProfileResponse } from '@quiz/shared/admin-attempts';
import { ArrowLeft, Award, Clock, Gauge, Target, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { PageHeader } from '@/components/cinema/page-header';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { historyStatusLabel } from '@quiz/shared/review';
import { historyTone, historyWhen } from '@/lib/review-params';
import { getSession } from '@/lib/session';
import { formatPercentage } from '@/lib/student-params';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Student record — Admin console',
  description: 'One student’s averages, category strengths and full attempt history.',
};

/**
 * One student, as a teacher needs to see them.
 *
 * Built from the same payload as the student's own profile (`/api/student/profile`
 * and `/api/admin/users/:id/profile` share one builder), so a conversation
 * between the two of them cannot start with two different averages.
 */
export default async function AdminUserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin/users');
  if (!decision.allowed) redirect(decision.redirectTo);

  const { id } = await params;

  let data: StudentProfileResponse | null = null;

  try {
    const res = await (await serverApi()).api.admin.users[':id'].profile.$get({ param: { id } });
    if (res.ok) data = await res.json();
  } catch {
    data = null;
  }

  if (!data) notFound();

  const { user, stats, history, categories } = data.profile;
  const accuracy =
    stats.questionsAnswered > 0
      ? Math.round((stats.questionsCorrect / stats.questionsAnswered) * 100)
      : null;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/users"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[12.5px] transition-colors"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        All users
      </Link>

      <PageHeader
        label={`${user.role.toLowerCase()} · joined ${new Date(user.createdAt).toLocaleDateString()}`}
        title={user.name}
        description={user.email}
        aside={
          <>
            <Badge variant={user.status === 'ACTIVE' ? 'success' : 'destructive'}>
              {user.status}
            </Badge>
            <Badge variant="outline">{user.role}</Badge>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Attempts"
          value={stats.attempts}
          hint={`${stats.completed} graded · ${stats.inProgress} running`}
          icon={Target}
        />
        <StatCard
          label="Average"
          value={formatPercentage(stats.averagePercentage)}
          hint={accuracy == null ? 'No answers yet' : `${accuracy}% of answers correct`}
          icon={Gauge}
          tone={stats.averagePercentage >= 60 ? 'success' : 'warning'}
        />
        <StatCard
          label="Best"
          value={stats.bestPercentage == null ? '—' : formatPercentage(stats.bestPercentage)}
          hint={
            stats.worstPercentage == null
              ? undefined
              : `lowest ${formatPercentage(stats.worstPercentage)}`
          }
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Certificates"
          value={stats.certificates}
          hint={`${stats.quizzesAttempted} quizzes attempted`}
          icon={Award}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">By category</CardTitle>
            <CardDescription className="text-[11.5px]">
              Average score per category — where the strengths and the gaps are.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-[12.5px]">
                No graded attempts yet.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {categories.map((category) => (
                  <li key={category.categoryId} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="truncate">{category.categoryName}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatPercentage(category.averagePercentage)} · {category.attempts}
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Engagement</CardTitle>
            <CardDescription className="text-[11.5px]">
              How much of each paper actually got answered.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-[12.5px]">
            {[
              {
                label: 'Questions answered',
                value: `${stats.questionsAnswered}`,
                hint: `${stats.questionsCorrect} correct`,
              },
              {
                label: 'Accuracy',
                value: accuracy == null ? '—' : `${accuracy}%`,
                hint: 'Correct answers over answered questions',
              },
              {
                label: 'Time on papers',
                value: `${Math.round(stats.timeSpentSeconds / 60)} min`,
                hint: 'Summed across every graded attempt',
              },
              {
                label: 'Passed / failed',
                value: `${stats.passed} / ${stats.failed}`,
                hint: 'Auto-submitted papers count as failed unless they cleared the pass mark',
              },
            ].map((row) => (
              <div
                key={row.label}
                className="border-border/50 flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p>{row.label}</p>
                  <p className="text-muted-foreground text-[11px]">{row.hint}</p>
                </div>
                <span className="font-display shrink-0 text-[1.15rem] font-light tabular-nums">
                  {row.value}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Attempt history</CardTitle>
          <CardDescription className="text-[11.5px]">
            Newest first. Open a row to see the answers.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {history.length === 0 ? (
            <p className="text-muted-foreground px-6 py-8 text-center text-[12.5px]">
              This student has not sat a quiz yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-[13px]">
                <caption className="sr-only">Attempts by this student, newest first</caption>
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
                          {historyStatusLabel({ status: entry.status })}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatPercentage(entry.percentage)}
                      </td>
                      <td className="text-muted-foreground px-3 py-2.5 text-[12px]">
                        {historyWhen(entry.completedAt ?? entry.startedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/admin/attempts/${entry.id}`}
                          className="text-[12px] underline-offset-4 hover:underline"
                        >
                          Open
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

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/attempts?search=${encodeURIComponent(user.email)}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <Clock aria-hidden />
          Filter attempts by this student
        </Link>
        <Link href="/admin/users" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          Back to the directory
        </Link>
      </div>
    </div>
  );
}
