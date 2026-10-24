import type {
  AdminAttemptListResponse,
  AdminAttemptStatusFilter,
} from '@quiz/shared/admin-attempts';
import { ArrowRight, Gauge, ListChecks, Search, ShieldCheck, Timer, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/cinema/page-header';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { historyTone, historyWhen } from '@/lib/review-params';
import { getSession } from '@/lib/session';
import { formatPercentage } from '@/lib/student-params';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Attempts — Admin console',
  description:
    'Every attempt on the platform, filtered by quiz, student and status, with the answers behind each one.',
};

const STATUSES: readonly { value: AdminAttemptStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Any status' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'PASSED', label: 'Passed' },
  { value: 'FAILED', label: 'Failed' },
];

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'score', label: 'Best score' },
  { value: 'duration', label: 'Longest sitting' },
] as const;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

/**
 * The platform's attempts, from the administrator's side.
 *
 * The student's `/student/results` answers "how did I do?"; this answers "how is
 * the platform doing?" — the same rows read from above. Filters live in the URL,
 * so a view is shareable, a reload reproduces it, and "send me every failure on
 * this quiz" is a link rather than a screenshot.
 *
 * The summary under the filters describes the **filtered set**, not the whole
 * platform: a filter that leaves the totals untouched looks broken.
 */
export default async function AdminAttemptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin/attempts');
  if (!decision.allowed) redirect(decision.redirectTo);

  const params = await searchParams;
  const search = one(params.search);
  const status = one(params.status) || 'ALL';
  const sort = one(params.sort) || 'newest';
  const quizId = one(params.quizId);
  const page = Math.max(1, Number(one(params.page)) || 1);

  let data: AdminAttemptListResponse | null = null;

  try {
    const res = await (
      await serverApi()
    ).api.admin.attempts.$get({
      query: {
        ...(search ? { search } : {}),
        ...(quizId ? { quizId } : {}),
        status: status as AdminAttemptStatusFilter,
        sort: sort as 'newest' | 'oldest' | 'score' | 'duration',
        page,
      },
    });
    if (res.ok) data = await res.json();
  } catch {
    data = null;
  }

  const filtered = Boolean(search || quizId || status !== 'ALL' || sort !== 'newest');

  function href(overrides: Record<string, string>): string {
    const query = new URLSearchParams();

    if (search) query.set('search', search);
    if (quizId) query.set('quizId', quizId);
    if (status !== 'ALL') query.set('status', status);
    if (sort !== 'newest') query.set('sort', sort);

    for (const [key, value] of Object.entries(overrides)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }

    const qs = query.toString();

    return qs ? `/admin/attempts?${qs}` : '/admin/attempts';
  }

  return (
    <div className="space-y-8">
      <PageHeader
        label="Admin console · attempts"
        title="Attempts"
        description="Every paper sat on this platform — who took it, how long they spent and what the grader wrote. Open a row for the answers themselves."
        aside={
          <>
            <Badge variant="warning" className="gap-1.5">
              <ShieldCheck />
              ADMIN
            </Badge>
            {data ? <Badge variant="outline">{data.pagination.total} attempts</Badge> : null}
          </>
        }
      />

      <Card>
        <CardContent>
          <form
            method="get"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto]"
          >
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search
                  aria-hidden
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                />
                <Input
                  id="search"
                  name="search"
                  defaultValue={search}
                  placeholder="Student, email or quiz"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={status}>
                {STATUSES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sort">Order</Label>
              <Select id="sort" name="sort" defaultValue={sort}>
                {SORTS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
              <Button type="submit" size="sm">
                Apply
              </Button>
              {filtered ? (
                <Link
                  href="/admin/attempts"
                  className="text-muted-foreground hover:text-foreground text-[12px] underline-offset-4 hover:underline"
                >
                  Clear {filtered ? 'filters' : ''}
                </Link>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Attempts"
              value={data.summary.attempts}
              hint={`${data.summary.graded} graded · ${data.summary.attempts - data.summary.graded} running`}
              icon={ListChecks}
            />
            <StatCard
              label="Average"
              value={formatPercentage(data.summary.averagePercentage)}
              hint={`${data.summary.passed} passed · ${data.summary.failed} failed`}
              icon={Gauge}
              tone={data.summary.averagePercentage >= 60 ? 'success' : 'warning'}
            />
            <StatCard
              label="Students"
              value={data.summary.participants}
              hint="Distinct accounts in this view"
              icon={Users}
            />
            <StatCard
              label="Quizzes"
              value={data.summary.quizzes}
              hint="Papers represented"
              icon={Timer}
            />
          </div>

          <Card>
            <CardContent className="px-0">
              {data.attempts.length === 0 ? (
                <p className="text-muted-foreground px-6 py-12 text-center text-[13px]">
                  No attempt matches these filters.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-[13px]">
                    <caption className="sr-only">
                      Attempts, {data.pagination.page} of {data.pagination.totalPages}, newest first
                    </caption>
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground border-border/70 border-y text-left text-[11px] tracking-wider uppercase">
                        <th scope="col" className="px-4 py-2.5 font-medium">
                          Student
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Quiz
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Status
                        </th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">
                          Score
                        </th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">
                          Took
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
                      {data.attempts.map((attempt) => (
                        <tr key={attempt.id} className="hover:bg-accent/25 transition-colors">
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/admin/users/${attempt.userId}`}
                              className="block max-w-[22ch] truncate underline-offset-4 hover:underline"
                            >
                              {attempt.userName}
                            </Link>
                            <p className="text-muted-foreground text-[11px]">{attempt.userEmail}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <Link
                              href={`/admin/quizzes/${attempt.quizId}`}
                              className="block max-w-[24ch] truncate underline-offset-4 hover:underline"
                            >
                              {attempt.quizTitle}
                            </Link>
                            <p className="text-muted-foreground text-[11px]">
                              {attempt.categoryName}
                            </p>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant={historyTone(attempt.status)} className="text-[10px]">
                                {attempt.status === 'IN_PROGRESS' ? 'In progress' : attempt.status}
                              </Badge>
                              {attempt.autoSubmitted ? (
                                <Badge variant="outline" className="text-[10px]">
                                  Auto
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {formatPercentage(attempt.percentage)}
                            <p className="text-muted-foreground text-[11px]">
                              {attempt.correctAnswers}✓ {attempt.incorrectAnswers}✗{' '}
                              {attempt.unanswered}–
                            </p>
                          </td>
                          <td className="text-muted-foreground px-3 py-2.5 text-right text-[12px] tabular-nums">
                            {Math.max(0, Math.round(attempt.timeTakenSeconds / 60))} min
                          </td>
                          <td className="text-muted-foreground px-3 py-2.5 text-[12px]">
                            {historyWhen(attempt.completedAt ?? attempt.startedAt)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Link
                              href={`/admin/attempts/${attempt.id}`}
                              className="inline-flex items-center gap-1 text-[12px] underline-offset-4 hover:underline"
                            >
                              Open
                              <ArrowRight aria-hidden className="size-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {data.pagination.totalPages > 1 ? (
                <nav
                  aria-label="Attempt pages"
                  className="border-border/60 flex items-center justify-between gap-3 border-t px-4 py-3 text-[12.5px]"
                >
                  <span className="text-muted-foreground">
                    Page {data.pagination.page} of {data.pagination.totalPages}
                  </span>
                  <div className="flex gap-2">
                    {data.pagination.hasPrev ? (
                      <Link
                        href={href({ page: String(data.pagination.page - 1) })}
                        className={cn(
                          'rounded-full border border-white/20 px-3 py-1.5 transition-colors hover:border-white/40',
                        )}
                      >
                        Previous
                      </Link>
                    ) : null}
                    {data.pagination.hasNext ? (
                      <Link
                        href={href({ page: String(data.pagination.page + 1) })}
                        className="rounded-full border border-white/20 px-3 py-1.5 transition-colors hover:border-white/40"
                      >
                        Next
                      </Link>
                    ) : null}
                  </div>
                </nav>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-[13px]">
            The attempts list could not be loaded. Reload the page to try again.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
