import type { AttemptSession } from '@quiz/shared/attempt';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { QuizRunner } from '@/components/quiz-runner';
import { Card, CardContent } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Attempt — QuizPlatform' };

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * The attempt screen.
 *
 * The page re-reads the attempt on every load, so a refresh restores the
 * saved answers and the remaining time from the server — not from anything the
 * browser kept. An attempt that belongs to someone else is simply `404`.
 */
export default async function AttemptPage({ params }: PageProps) {
  const { id } = await params;
  const decision = decideAccess(await getSession(), 'STUDENT', `/student/attempt/${id}`);
  if (!decision.allowed) redirect(decision.redirectTo);

  let session: AttemptSession | null = null;

  try {
    const api = await serverApi();
    const res = await api.api.student.attempts[':id'].$get({ param: { id } });

    if ((res.status as number) === 404) notFound();
    if (res.ok) session = await res.json();
  } catch {
    session = null;
  }

  if (!session) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm font-medium">This attempt could not be loaded.</p>
          <p className="text-muted-foreground mt-1 text-[12.5px]">
            Check the API on port 3001, then{' '}
            <Link href="/student/quizzes" className="text-primary hover:underline">
              return to the catalogue
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return <QuizRunner initial={session} />;
}
