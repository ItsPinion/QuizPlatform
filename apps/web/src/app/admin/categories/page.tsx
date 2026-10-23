import type { CategoryListResponse } from '@quiz/shared/quiz';
import { FolderTree, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { CategoriesManager } from '@/components/categories-manager';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Categories — Admin console' };

/**
 * Category management.
 *
 * Server-rendered list, client-side mutations: the page authorises with
 * `decideAccess`, forwards the session cookie to the guarded endpoint, and the
 * manager sends every write through `hc<AppType>`.
 */
export default async function AdminCategoriesPage() {
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin/categories');
  if (!decision.allowed) redirect(decision.redirectTo);

  let categories: CategoryListResponse['categories'] = [];
  let unreachable = false;

  try {
    const api = await serverApi();
    const res = await api.api.admin.categories.$get();

    if (res.ok) categories = (await res.json()).categories;
  } catch {
    unreachable = true;
  }

  const inUse = categories.filter((category) => category.quizCount > 0).length;
  const filed = categories.reduce((sum, category) => sum + category.quizCount, 0);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="warning" className="gap-1.5">
            <ShieldCheck />
            ADMIN
          </Badge>
          <Badge variant="outline">Day 6 · categories &amp; questions</Badge>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Categories are data, not an enum: create, rename and remove them here, and every quiz form
          picks them up. A category that still has quizzes cannot be deleted.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="py-4">
          <CardContent className="space-y-1">
            <p className="text-muted-foreground text-[11px] tracking-wider uppercase">Categories</p>
            <p className="text-2xl font-semibold tabular-nums">{categories.length}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="space-y-1">
            <p className="text-muted-foreground text-[11px] tracking-wider uppercase">In use</p>
            <p className="text-2xl font-semibold tabular-nums">{inUse}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="space-y-1">
            <p className="text-muted-foreground text-[11px] tracking-wider uppercase">
              Quizzes filed
            </p>
            <p className="text-2xl font-semibold tabular-nums">{filed}</p>
          </CardContent>
        </Card>
      </div>

      {unreachable ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">Categories could not be loaded.</p>
            <p className="text-muted-foreground mt-1 text-[12.5px]">
              Check the API on port 3001, then{' '}
              <Link href="/admin/categories" className="text-primary hover:underline">
                reload this page
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      ) : (
        <CategoriesManager initialCategories={categories} />
      )}

      <Card>
        <CardContent className="text-muted-foreground flex flex-wrap items-start gap-x-6 gap-y-2 py-4 text-[12px]">
          <span className="text-foreground inline-flex items-center gap-1.5 font-medium">
            <FolderTree className="text-primary size-3.5" />
            Rules
          </span>
          <span>
            Names are compared lowercased and whitespace-collapsed, so “react” and “React” are the
            same category.
          </span>
          <span>Renaming keeps the slug, so existing links still resolve.</span>
        </CardContent>
      </Card>
    </div>
  );
}
