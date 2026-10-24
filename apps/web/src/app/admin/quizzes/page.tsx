import type { CategoryListResponse, QuizListResponse } from '@quiz/shared/quiz';
import { ArrowLeft, ArrowRight, EyeOff, ListChecks, Plus, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BuildBadge } from '@/components/build-badge';
import { PageHeader } from '@/components/cinema/page-header';
import { QuizPublishButton } from '@/components/quiz-publish-button';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import {
  DEFAULT_QUIZ_PAGE_SIZE,
  describeQuizFilters,
  difficultyTone,
  formatDuration,
  hasQuizFilters,
  parseQuizFilters,
  quizzesHref,
  statusTone,
  toQuizQuery,
} from '@/lib/quiz-params';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Quizzes — Admin console' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminQuizzesPage({ searchParams }: PageProps) {
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin/quizzes');
  if (!decision.allowed) redirect(decision.redirectTo);

  const filters = parseQuizFilters(await searchParams);

  let data: QuizListResponse | null = null;
  let categories: CategoryListResponse['categories'] = [];

  try {
    const api = await serverApi();
    const [listRes, categoryRes] = await Promise.all([
      api.api.admin.quizzes.$get({ query: toQuizQuery(filters) }),
      api.api.admin.categories.$get(),
    ]);

    if (listRes.ok) data = await listRes.json();
    if (categoryRes.ok) categories = (await categoryRes.json()).categories;
  } catch {
    data = null;
  }

  const categoryName = categories.find((category) => category.id === filters.categoryId)?.name;
  const filtered = hasQuizFilters(filters);

  // The quizzes on this page that a student cannot see. Counted here rather than
  // in the table, because the warning belongs above it: an admin whose new quiz
  // "is missing" from the catalogue is almost always looking at one of these.
  const hidden = (data?.quizzes ?? []).filter((quiz) => quiz.status !== 'PUBLISHED');

  return (
    <div className="space-y-8">
      <PageHeader
        label="Admin console · the shelf"
        title="Quizzes"
        description="Create, edit and remove quizzes, and control what students can see. Publishing is a separate, guarded action — a draft with no questions cannot go live."
        aside={
          <>
            <Badge variant="warning" className="hidden gap-1.5 sm:inline-flex">
              <ShieldCheck />
              ADMIN
            </Badge>
            <BuildBadge className="hidden sm:inline-flex">Day 5 · quiz management</BuildBadge>
            <Link
              href="/admin/quizzes/new"
              className={cn(buttonVariants({ size: 'sm' }), 'h-10 rounded-full px-5')}
            >
              <Plus />
              New quiz
            </Link>
          </>
        }
      />

      <Card className="py-5">
        <CardContent>
          <form
            method="get"
            action="/admin/quizzes"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_150px_150px_180px_auto]"
          >
            <div className="space-y-1.5">
              <Label htmlFor="search" className="text-[11.5px]">
                Search title
              </Label>
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
                <Input
                  id="search"
                  name="search"
                  defaultValue={filters.search}
                  placeholder="JavaScript…"
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-[11.5px]">
                Status
              </Label>
              <Select id="status" name="status" defaultValue={filters.status}>
                <option value="">Any</option>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="UNPUBLISHED">Unpublished</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="difficulty" className="text-[11.5px]">
                Difficulty
              </Label>
              <Select id="difficulty" name="difficulty" defaultValue={filters.difficulty}>
                <option value="">Any</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="categoryId" className="text-[11.5px]">
                Category
              </Label>
              <Select id="categoryId" name="categoryId" defaultValue={filters.categoryId}>
                <option value="">Any</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.quizCount})
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <button type="submit" className={cn(buttonVariants({ size: 'lg' }), 'rounded-lg')}>
                Apply
              </button>
              {filtered ? (
                <Link
                  href={quizzesHref({})}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'h-9')}
                >
                  Clear
                </Link>
              ) : null}
            </div>

            {filters.pageSize !== DEFAULT_QUIZ_PAGE_SIZE ? (
              <input type="hidden" name="pageSize" value={filters.pageSize} />
            ) : null}
          </form>
        </CardContent>
      </Card>

      {data === null ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">The quiz directory could not be loaded.</p>
            <p className="text-muted-foreground mt-1 text-[12.5px]">
              Check <code className="bg-muted rounded px-1">/api/health/db</code> and that the API
              is running on port 3001.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section aria-label="Directory summary" className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Quizzes"
              value={data.pagination.total}
              hint={describeQuizFilters(filters, categoryName)}
              icon={ListChecks}
            />
            <StatCard
              label="Published on this page"
              value={data.quizzes.filter((quiz) => quiz.status === 'PUBLISHED').length}
              hint="Only published quizzes reach students"
              icon={ShieldCheck}
              tone="success"
            />
            <StatCard
              label="Page"
              value={`${data.pagination.page} / ${data.pagination.totalPages}`}
              hint={`Page size ${data.pagination.pageSize}`}
              icon={Search}
            />
          </section>

          {hidden.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
                <div>
                  <p className="text-[13px] font-medium text-amber-100">
                    {hidden.length} quiz{hidden.length === 1 ? ' is' : 'es are'} not published
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-amber-200/80">
                    Students only ever see published quizzes, so{' '}
                    {hidden.length === 1 ? 'this one' : 'these'} will not appear in their catalogue
                    until you publish. A quiz needs at least one question first.
                  </p>
                </div>
              </div>
              <Link
                href={quizzesHref({ ...filters, status: 'DRAFT' })}
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  'shrink-0 rounded-full',
                )}
              >
                Show only drafts
              </Link>
            </div>
          ) : null}

          {data.quizzes.length === 0 ? (
            <div className="border-border/70 bg-card/40 rounded-xl border border-dashed px-6 py-12 text-center">
              <p className="text-sm font-medium">No quizzes match these filters.</p>
              <p className="text-muted-foreground mt-1 text-[12.5px]">
                Clear the filters, or create the first quiz in this category.
              </p>
            </div>
          ) : (
            <div className="border-border/70 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[780px] text-[13px]">
                <thead>
                  <tr className="cine-label border-b border-white/10 bg-white/[0.02] text-left text-[9px] text-gray-400">
                    <th className="px-4 py-2.5 font-medium">Quiz</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Questions</th>
                    <th className="px-3 py-2.5 font-medium">Attempts</th>
                    <th className="px-3 py-2.5 font-medium">Duration</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-border/60 divide-y">
                  {data.quizzes.map((quiz) => (
                    <tr key={quiz.id} className="hover:bg-accent/25 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/quizzes/${quiz.id}`}
                          className="font-medium hover:underline"
                        >
                          {quiz.title}
                        </Link>
                        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                          <span>{quiz.categoryName}</span>
                          <span aria-hidden="true">·</span>
                          <Badge variant={difficultyTone(quiz.difficulty)} className="text-[9.5px]">
                            {quiz.difficulty}
                          </Badge>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[10.5px]">{quiz.slug}</span>
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={statusTone(quiz.status)}>{quiz.status}</Badge>
                      </td>
                      <td className="px-3 py-3 tabular-nums">{quiz.questionCount}</td>
                      <td className="px-3 py-3 tabular-nums">{quiz.attemptCount}</td>
                      <td className="text-muted-foreground px-3 py-3">
                        {formatDuration(quiz.durationMinutes)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {quiz.status !== 'PUBLISHED' ? (
                            <QuizPublishButton
                              quizId={quiz.id}
                              questionCount={quiz.questionCount}
                            />
                          ) : null}
                          <Link
                            href={`/admin/quizzes/${quiz.id}`}
                            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
                          >
                            Manage
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
            {data.pagination.hasPrev ? (
              <Link
                href={quizzesHref({ ...filters, page: filters.page - 1 })}
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
              >
                <ArrowLeft />
                Previous
              </Link>
            ) : (
              <span
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'pointer-events-none opacity-40',
                )}
              >
                <ArrowLeft />
                Previous
              </span>
            )}

            <span className="text-muted-foreground text-[12px]">
              {data.pagination.total === 0
                ? '0 of 0'
                : `${(data.pagination.page - 1) * data.pagination.pageSize + 1}–${Math.min(
                    data.pagination.total,
                    data.pagination.page * data.pagination.pageSize,
                  )} of ${data.pagination.total}`}
            </span>

            {data.pagination.hasNext ? (
              <Link
                href={quizzesHref({ ...filters, page: filters.page + 1 })}
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
              >
                Next
                <ArrowRight />
              </Link>
            ) : (
              <span
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'pointer-events-none opacity-40',
                )}
              >
                Next
                <ArrowRight />
              </span>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
