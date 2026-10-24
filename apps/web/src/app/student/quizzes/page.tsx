import type { CategoryListResponse } from '@quiz/shared/quiz';

import { PageHeader } from '@/components/cinema/page-header';
import type { StudentQuizListResponse } from '@quiz/shared/attempt';
import { ArrowLeft, ArrowRight, Search, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { StudentQuizCard } from '@/components/student-quiz-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';
import {
  describeStudentFilters,
  hasStudentFilters,
  parseStudentFilters,
  quizzesHref,
  toStudentQuery,
} from '@/lib/student-params';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Quizzes — QuizPlatform' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The catalogue.
 *
 * Filters live in the URL and the form is a plain GET form, so a filtered view
 * is shareable and works without JavaScript. The API decides what a student may
 * see: only published quizzes ever reach this page.
 */
export default async function StudentQuizzesPage({ searchParams }: PageProps) {
  const decision = decideAccess(await getSession(), 'STUDENT', '/student/quizzes');
  if (!decision.allowed) redirect(decision.redirectTo);

  const filters = parseStudentFilters(await searchParams);

  let data: StudentQuizListResponse | null = null;
  let categories: CategoryListResponse['categories'] = [];

  try {
    const api = await serverApi();
    const [listRes, categoryRes] = await Promise.all([
      api.api.student.quizzes.$get({ query: toStudentQuery(filters) }),
      api.api.student.categories.$get(),
    ]);

    if (listRes.ok) data = await listRes.json();
    if (categoryRes.ok) categories = (await categoryRes.json()).categories;
  } catch {
    data = null;
  }

  const categoryName = categories.find((category) => category.id === filters.categoryId)?.name;
  const filtered = hasStudentFilters(filters);
  const summary = describeStudentFilters(filters, categoryName);

  return (
    <div className="space-y-6">
      <PageHeader
        label="Student · the catalogue"
        title="Quizzes"
        description="Drafts and unpublished quizzes are invisible here — the API filters them before a page is rendered, so there is nothing to find by guessing an id."
        aside={
          <>
            <Badge variant="outline">Student catalogue</Badge>
            <Badge variant="outline">{data?.pagination.total ?? 0} published</Badge>
          </>
        }
      />

      <Card>
        <CardContent className="py-4">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                name="search"
                defaultValue={filters.search}
                placeholder="Quiz title…"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="categoryId">Category</Label>
              <Select id="categoryId" name="categoryId" defaultValue={filters.categoryId}>
                <option value="">All categories</option>
                {categories
                  .filter((category) => category.quizCount > 0)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select id="difficulty" name="difficulty" defaultValue={filters.difficulty}>
                <option value="">Any</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sort">Sort</Label>
              <Select id="sort" name="sort" defaultValue={filters.sort}>
                <option value="newest">Newest</option>
                <option value="title">Title</option>
                <option value="duration">Shortest first</option>
              </Select>
            </div>

            <div className="flex items-end gap-2 lg:col-span-2">
              <button type="submit" className={cn(buttonVariants({ size: 'lg' }), 'rounded-lg')}>
                <Search />
                Apply
              </button>
              {filtered ? (
                <Link
                  href="/student/quizzes"
                  className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }))}
                >
                  Clear
                </Link>
              ) : null}
              <span className="text-muted-foreground ml-auto inline-flex items-center gap-1.5 text-[11px]">
                <SlidersHorizontal className="size-3.5" />
                filters live in the URL
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      {filtered ? (
        <p className="text-muted-foreground text-[12px]">
          Filtered by {summary.join(' · ')} — {data?.pagination.total ?? 0} match
          {(data?.pagination.total ?? 0) === 1 ? '' : 'es'}.
        </p>
      ) : null}

      {!data ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">The catalogue could not be loaded.</p>
            <p className="text-muted-foreground mt-1 text-[12.5px]">
              Check the API on port 3001, then{' '}
              <Link href="/student/quizzes" className="text-primary hover:underline">
                reload
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      ) : data.quizzes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">No quizzes match those filters.</p>
            <p className="text-muted-foreground mt-1 text-[12.5px]">
              {filtered ? (
                <Link href="/student/quizzes" className="text-primary hover:underline">
                  Clear them
                </Link>
              ) : (
                'An admin has not published any quizzes yet.'
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.quizzes.map((quiz) => (
            <StudentQuizCard key={quiz.id} quiz={quiz} />
          ))}
        </div>
      )}

      {data && data.pagination.totalPages > 1 ? (
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
            <span />
          )}

          <span className="text-muted-foreground text-[12px]">
            Page {data.pagination.page} of {data.pagination.totalPages}
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
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
