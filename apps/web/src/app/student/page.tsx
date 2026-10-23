import { GraduationCap, ListChecks, Trophy, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SiteHeader } from '@/components/site-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Student area — QuizPlatform',
  description: 'Take quizzes, review results and track your standing.',
};

const MODULES = [
  {
    day: 7,
    title: 'Quiz catalogue',
    detail: 'Browse published quizzes, filter by category and start an attempt.',
    icon: ListChecks,
  },
  {
    day: 9,
    title: 'Results',
    detail: 'Score breakdowns, answer review and attempt history.',
    icon: GraduationCap,
  },
  {
    day: 12,
    title: 'Leaderboard',
    detail: 'Overall and category rankings.',
    icon: Trophy,
  },
];

export default async function StudentPage() {
  // Admins have their own area; sending them here would only loop through 403s.
  const decision = decideAccess(await getSession(), 'STUDENT', '/student');
  if (!decision.allowed) redirect(decision.redirectTo);

  const { session } = decision;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="gap-1.5">
            <UserRound className="size-3" />
            STUDENT
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hello, {session.user.name.split(' ')[0]}
          </h1>
        </div>

        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Guarded by <code className="bg-muted rounded px-1 py-0.5">/api/student/access</code> — a
          request without a valid <code className="bg-muted rounded px-1 py-0.5">STUDENT</code>{' '}
          session never reaches this page.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {MODULES.map((module) => (
            <Card key={module.title} className="bg-card/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <module.icon className="text-primary size-4" />
                  {module.title}
                </CardTitle>
                <CardDescription>{module.detail}</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="outline" className="text-[10px]">
                  Day {module.day}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-4">
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
      </main>
    </div>
  );
}
