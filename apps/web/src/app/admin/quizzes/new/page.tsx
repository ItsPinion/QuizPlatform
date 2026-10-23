import type { CategoryListResponse } from '@quiz/shared/quiz';
import { ArrowLeft, Plus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { QuizForm } from '@/components/quiz-form';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata = { title: 'New quiz — Admin console' };

export default async function NewQuizPage() {
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin/quizzes/new');
  if (!decision.allowed) redirect(decision.redirectTo);

  let categories: CategoryListResponse['categories'] = [];
  let failed = false;

  try {
    const res = await (await serverApi()).api.admin.categories.$get();
    if (res.ok) categories = (await res.json()).categories;
    else failed = true;
  } catch {
    failed = true;
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="warning" className="gap-1.5">
            <ShieldCheck />
            ADMIN
          </Badge>
          <Badge variant="outline">Day 5 · quiz management</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/quizzes"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[12.5px]"
          >
            <ArrowLeft className="size-3.5" />
            Quizzes
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">New quiz</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Every quiz starts as a <strong>draft</strong>. The status is not chosen here: publishing
          is a separate action, so nothing goes live by accident.
        </p>
      </header>

      <Card>
        <CardContent>
          {failed ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium">Categories could not be loaded.</p>
              <p className="text-muted-foreground mt-1 text-[12.5px]">
                The form needs at least one category — check the API and{' '}
                <code className="bg-muted rounded px-1">/api/health/db</code>.
              </p>
            </div>
          ) : (
            <QuizForm categories={categories} />
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Link
          href="/admin/quizzes"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          <Plus className="rotate-45" />
          Back to the list
        </Link>
      </div>
    </div>
  );
}
