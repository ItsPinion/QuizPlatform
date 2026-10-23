import type { UserListResponse } from '@quiz/shared/admin';
import { ArrowLeft, ArrowRight, Search, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { StatCard } from '@/components/stat-card';
import { UsersTable } from '@/components/users-table';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_PAGE_SIZE,
  describeFilters,
  hasActiveFilters,
  parseUserFilters,
  rangeLabel,
  toUserQuery,
  usersHref,
} from '@/lib/admin-params';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Users — Admin console' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin/users');
  if (!decision.allowed) redirect(decision.redirectTo);

  const filters = parseUserFilters(await searchParams);

  let data: UserListResponse | null = null;
  try {
    const res = await (await serverApi()).api.admin.users.$get({ query: toUserQuery(filters) });
    if (res.ok) data = await res.json();
  } catch {
    data = null;
  }

  const filtered = hasActiveFilters(filters);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="warning" className="gap-1.5">
            <ShieldCheck />
            ADMIN
          </Badge>
          <Badge variant="outline">Day 4 · user management</Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Search, filter, promote and deactivate accounts. Every action is one{' '}
          <code className="bg-muted rounded px-1 py-0.5 text-[12px]">
            PATCH /api/admin/users/:id
          </code>{' '}
          call — the API re-checks the ADMIN role and refuses to let you lock yourself out.
        </p>
      </header>

      {/* Filters are a plain GET form: shareable URLs, working back button, no JS required. */}
      <Card className="py-5">
        <CardContent>
          <form method="get" action="/admin/users" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_150px_150px_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="search" className="text-[11.5px]">
                  Search
                </Label>
                <div className="relative">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
                  <Input
                    id="search"
                    name="search"
                    defaultValue={filters.search}
                    placeholder="Name or email"
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role" className="text-[11.5px]">
                  Role
                </Label>
                <select
                  id="role"
                  name="role"
                  defaultValue={filters.role}
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-[13px]"
                >
                  <option value="">Any</option>
                  <option value="ADMIN">Admin</option>
                  <option value="STUDENT">Student</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status" className="text-[11.5px]">
                  Status
                </Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={filters.status}
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-[13px]"
                >
                  <option value="">Any</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sort" className="text-[11.5px]">
                  Sort
                </Label>
                <select
                  id="sort"
                  name="sort"
                  defaultValue={filters.sort}
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-[13px]"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="name">Name</option>
                  <option value="attempts">Most attempts</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <button type="submit" className={cn(buttonVariants({ size: 'sm' }), 'h-9')}>
                  <SlidersHorizontal />
                  Apply
                </button>
                {filtered ? (
                  <Link
                    href={usersHref({})}
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-9')}
                  >
                    Clear
                  </Link>
                ) : null}
              </div>
            </div>

            {filters.pageSize !== DEFAULT_PAGE_SIZE ? (
              <input type="hidden" name="pageSize" value={filters.pageSize} />
            ) : null}
          </form>
        </CardContent>
      </Card>

      {data === null ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">The user directory could not be loaded.</p>
            <p className="text-muted-foreground mt-1 text-[12.5px]">
              Check <code className="bg-muted rounded px-1">/api/health/db</code> and make sure the
              API is running on port 3001.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section aria-label="Directory summary" className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Matching accounts"
              value={data.pagination.total}
              hint={describeFilters(filters)}
              icon={Users}
            />
            <StatCard
              label="Page"
              value={`${data.pagination.page} / ${data.pagination.totalPages}`}
              hint={rangeLabel(data.pagination)}
              icon={SlidersHorizontal}
            />
            <StatCard
              label="Showing"
              value={data.users.length}
              hint={`Page size ${data.pagination.pageSize}`}
              icon={Search}
            />
          </section>

          <UsersTable
            key={JSON.stringify(filters)}
            users={data.users}
            currentUserId={decision.session.user.id}
          />

          <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
            {data.pagination.hasPrev ? (
              <Link
                href={usersHref({ ...filters, page: filters.page - 1 })}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                <ArrowLeft />
                Previous
              </Link>
            ) : (
              <span
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  'pointer-events-none opacity-40',
                )}
              >
                <ArrowLeft />
                Previous
              </span>
            )}

            <span className="text-muted-foreground text-[12px]">{rangeLabel(data.pagination)}</span>

            {data.pagination.hasNext ? (
              <Link
                href={usersHref({ ...filters, page: filters.page + 1 })}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                Next
                <ArrowRight />
              </Link>
            ) : (
              <span
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
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
