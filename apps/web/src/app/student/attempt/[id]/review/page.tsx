import type { AttemptReview } from '@quiz/shared/review';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AnswerReview } from '@/components/answer-review';
import { Card, CardContent } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { parseReviewFilter } from '@/lib/review-params';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Answer review — QuizPlatform' };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Answer review for one finished attempt.
 *
 * Three outcomes, all decided by the API: a finished attempt renders the paper
 * with the key; another student's attempt is `404`; an attempt that is still
 * running answers `409` and is sent back to the taker, because the key must not
 * reach a screen that can still change the answers.
 */
export default async function ReviewPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const filter = parseReviewFilter(await searchParams);

  const decision = decideAccess(await getSession(), 'STUDENT', `/student/attempt/${id}/review`);
  if (!decision.allowed) redirect(decision.redirectTo);

  let review: AttemptReview | null = null;
  let notSubmitted = false;

  try {
    const api = await serverApi();
    const res = await api.api.student.attempts[':id'].review.$get({ param: { id } });

    if ((res.status as number) === 404) notFound();
    if ((res.status as number) === 409) notSubmitted = true;
    else if (res.ok) review = await res.json();
  } catch {
    review = null;
  }

  if (notSubmitted) {
    return (
      <Card>
        <CardContent className="space-y-2 py-10 text-center">
          <p className="text-sm font-medium">This attempt is still running.</p>
          <p className="text-muted-foreground text-[12.5px]">
            The answer key stays hidden until you submit, so nothing can be read out of the network
            tab mid-quiz.
          </p>
          <Link
            href={`/student/attempt/${id}`}
            className="text-primary inline-block text-[12.5px] hover:underline"
          >
            Back to the attempt
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (!review) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm font-medium">This review could not be loaded.</p>
          <p className="text-muted-foreground mt-1 text-[12.5px]">
            Check the API on port 3001, then{' '}
            <Link href="/student/results" className="text-primary hover:underline">
              return to your results
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return <AnswerReview review={review} filter={filter} />;
}
