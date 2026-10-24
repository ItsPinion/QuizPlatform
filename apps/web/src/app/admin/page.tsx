import type { DashboardStats } from '@quiz/shared/admin';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Database,
  ListChecks,
  Percent,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/cinema/page-header';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { relativeDay } from '@/lib/admin-params';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  PASSED: 'text-success',
  FAILED: 'text-destructive',
  EXPIRED: 'text-warning',
  IN_PROGRESS: 'text-muted-foreground',
};

/** A labelled proportion bar — used for the account mix card. */
function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[12.5px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">
          {value}
          <span className="text-muted-foreground/70"> / {total}</span>
        </span>
      </div>
      <div className="bg-muted/70 h-1.5 overflow-hidden rounded-full">
        <div className="bg-primary h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin');
  if (!decision.allowed) redirect(decision.redirectTo);

  const { session } = decision;

  let stats: DashboardStats | null = null;
  try {
    const res = await (await serverApi()).api.admin.stats.$get();
    if (res.ok) stats = await res.json();
  } catch {
    // API down or database not configured yet — the page explains itself below.
    stats = null;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        label="Admin console · overview"
        title={
          <>
            Welcome back,{' '}
            <span className="cine-gradient-text italic">{session.user.name.split(' ')[0]}</span>
          </>
        }
        description={
          <>
            Every number below comes from{' '}
            <code className="rounded bg-white/8 px-1 py-0.5 font-mono text-[12px]">
              GET /api/admin/stats
            </code>
            , which the ADMIN guard protects before the handler runs.
          </>
        }
        aside={
          <>
            <Badge variant="warning" className="gap-1.5">
              <ShieldCheck />
              ADMIN
            </Badge>
            <Badge variant="outline">Day 4 · dashboard</Badge>
          </>
        }
      />

      {stats === null ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="text-warning size-4" />
              Statistics are unavailable
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
      ) : (
        <>
          <section aria-label="Key statistics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Accounts"
              value={stats.users.total}
              hint={`${stats.users.active} active · ${stats.users.inactive} inactive`}
              icon={Users}
            />
            <StatCard
              label="Quizzes"
              value={stats.content.quizzes}
              hint={`${stats.content.published} published · ${stats.content.drafts} draft`}
              icon={ListChecks}
            />
            <StatCard
              label="Questions"
              value={stats.content.questions}
              hint={`${stats.content.options} options · ${stats.content.categories} categories`}
              icon={BookOpen}
            />
            <StatCard
              label="Attempts"
              value={stats.attempts.total}
              hint={`${stats.attempts.learners} learners · ${stats.attempts.inProgress} in progress`}
              icon={Activity}
              tone="primary"
            />
            <StatCard
              label="Pass rate"
              value={`${stats.attempts.passRate}%`}
              hint={`${stats.attempts.passed} passed · ${stats.attempts.failed} failed · ${stats.attempts.expired} expired`}
              icon={Percent}
              tone="success"
            />
            <StatCard
              label="Average score"
              value={`${stats.attempts.averagePercentage}%`}
              hint="Mean percentage across graded attempts"
              icon={Activity}
            />
            <StatCard
              label="New this week"
              value={stats.users.joinedLast7Days}
              hint="Accounts created in the last 7 days"
              icon={Users}
              tone="warning"
            />
            <StatCard
              label="Content mix"
              value={`${stats.content.published}/${stats.content.quizzes}`}
              hint="Published quizzes out of all quizzes"
              icon={ListChecks}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Account mix</CardTitle>
                <CardDescription>Who can sign in, and with which role.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Bar label="Active accounts" value={stats.users.active} total={stats.users.total} />
                <Bar label="Administrators" value={stats.users.admins} total={stats.users.total} />
                <Bar label="Students" value={stats.users.students} total={stats.users.total} />
                <Bar
                  label="Attempted at least once"
                  value={stats.attempts.learners}
                  total={stats.users.students}
                />
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <Link
                    href="/admin/users"
                    className="text-primary inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline"
                  >
                    Manage users
                    <ArrowRight className="size-3.5" />
                  </Link>
                  <Link
                    href="/admin/quizzes"
                    className="text-primary inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline"
                  >
                    Manage quizzes
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Newest accounts</CardTitle>
                <CardDescription>Five most recent sign-ups.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-border/60 divide-y">
                  {stats.recentUsers.map((user) => (
                    <li key={user.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{user.name}</p>
                        <p className="text-muted-foreground truncate font-mono text-[11.5px]">
                          {user.email}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant={user.role === 'ADMIN' ? 'warning' : 'secondary'}>
                          {user.role}
                        </Badge>
                        <span className="text-muted-foreground w-16 text-right text-[11.5px]">
                          {relativeDay(user.createdAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent attempts</CardTitle>
              <CardDescription>
                The five latest starts, straight from the attempts table.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead>
                    <tr className="cine-label border-b border-white/8 text-left text-[9px] text-gray-400">
                      <th className="py-2 pr-3 font-medium">Student</th>
                      <th className="py-2 pr-3 font-medium">Quiz</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 text-right font-medium">Score</th>
                      <th className="py-2 text-right font-medium">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border/60 divide-y">
                    {stats.recentAttempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td className="py-2.5 pr-3">{attempt.userName}</td>
                        <td className="text-muted-foreground py-2.5 pr-3">{attempt.quizTitle}</td>
                        <td
                          className={cn(
                            'py-2.5 pr-3 font-mono text-[11.5px]',
                            STATUS_STYLES[attempt.status] ?? 'text-muted-foreground',
                          )}
                        >
                          {attempt.status}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {attempt.percentage.toFixed(1)}%
                        </td>
                        <td className="text-muted-foreground py-2.5 text-right text-[12px]">
                          {relativeDay(attempt.startedAt)}
                        </td>
                      </tr>
                    ))}
                    {stats.recentAttempts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-muted-foreground py-6 text-center">
                          No attempts yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="text-muted-foreground text-[11.5px]">
            Snapshot generated {new Date(stats.generatedAt).toLocaleString()} ·{' '}
            <code className="bg-muted rounded px-1">no-store</code> — never cached across admins.
          </p>
        </>
      )}
    </div>
  );
}
