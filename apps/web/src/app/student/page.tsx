import type { StudentQuizListResponse } from '@quiz/shared/attempt';
import { ArrowRight, CirclePlay, Clock, ListChecks, Trophy, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { StudentQuizCard } from '@/components/student-quiz-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Student area — QuizPlatform',
  description: 'Take quizzes, resume attempts and track your standing.',
};

/**
 * Student overview.
 *
 * Everything on this page comes from `GET /api/student/quizzes`, which is
 * scoped to the signed-in student: the "resume" card exists because the API
 * reported a live attempt, not because the browser remembered one.
 */
export default async function StudentPage() {
  const decision = decideAccess(await getSession(), 'STUDENT', '/student');
  if (!decision.allowed) redirect(decision.redirectTo);

  const { session } = decision;

  let data: StudentQuizListResponse | null = null;

  try {
    const api = await serverApi();
    const res = await api.api.student.quizzes.$get({ query: { pageSize: '24' } });
    if (res.ok) data = await res.json();
  } catch {
    data = null;
  }

  const quizzes = data?.quizzes ?? [];
  const live = quizzes.filter((quiz) => quiz.inProgressAttemptId);
  const attemptsUsed = quizzes.reduce((sum, quiz) => sum + quiz.attemptsUsed, 0);
  const best = quizzes.reduce<number | null>(
    (top, quiz) => (quiz.bestPercentage == null ? top : Math.max(top ?? 0, quiz.bestPercentage)),
    null,
  );
  const toTry = quizzes
    .filter((quiz) => quiz.attemptsRemaining > 0 || quiz.inProgressAttemptId)
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="gap-1.5">
            <UserRound className="size-3" />
            STUDENT
          </Badge>
          <Badge variant="outline">Day 7 · quiz interface</Badge>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          Hello, {session.user.name.split(' ')[0]}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Every published quiz is here, with its rules stated up front: duration, pass mark,
          attempts left. An attempt runs on the server clock, so closing the tab does not stop it.
        </p>
      </header>

      {live.length > 0 ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="text-warning size-4" />
              An attempt is still running
            </CardTitle>
            <CardDescription>
              The deadline keeps counting while you are away. Pick it up where you left off.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px]">{live[0]?.title}</span>
            <Link
              href={`/student/attempt/${live[0]?.inProgressAttemptId}`}
              className={buttonVariants({ size: 'sm' })}
            >
              <CirclePlay />
              Resume attempt
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="py-4">
          <CardContent className="space-y-1">
            <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] tracking-wider uppercase">
              <ListChecks className="size-3.5" /> Published
            </p>
            <p className="text-2xl font-semibold tabular-nums">{data?.pagination.total ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="space-y-1">
            <p className="text-muted-foreground text-[11px] tracking-wider uppercase">
              Attempts started
            </p>
            <p className="text-2xl font-semibold tabular-nums">{attemptsUsed}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="space-y-1">
            <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] tracking-wider uppercase">
              <Trophy className="size-3.5" /> Best score
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {best == null ? '—' : `${Math.round(best)}%`}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-medium">Ready when you are</h2>
          <Link
            href="/student/quizzes"
            className="text-primary inline-flex items-center gap-1 text-[12.5px] hover:underline"
          >
            Browse all quizzes <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {toTry.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-8 text-center text-[13px]">
              {data
                ? 'You have used every attempt available to you. Results arrive in Day 9.'
                : 'The quiz catalogue could not be loaded. Check the API on port 3001.'}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {toTry.map((quiz) => (
              <StudentQuizCard key={quiz.id} quiz={quiz} />
            ))}
          </div>
        )}
      </section>

      <Card>
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
    </div>
  );
}
