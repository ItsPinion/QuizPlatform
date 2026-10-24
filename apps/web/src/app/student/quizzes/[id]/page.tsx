import type { StudentQuizDetailResponse } from '@quiz/shared/attempt';

import { PageHeader } from '@/components/cinema/page-header';
import {
  ArrowLeft,
  Award,
  CalendarClock,
  CircleAlert,
  Clock,
  HelpCircle,
  ListChecks,
  MinusCircle,
  ShieldCheck,
  Target,
  Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StartQuizButton } from '@/components/start-quiz-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { difficultyTone, formatDuration } from '@/lib/quiz-params';
import { getSession } from '@/lib/session';
import { attemptsLabel, bestScoreLabel } from '@/lib/student-params';

export const metadata = { title: 'Quiz details — QuizPlatform' };

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Quiz details before starting.
 *
 * The rules are stated here rather than discovered later: how long it runs, what
 * it takes to pass, how many tries are left. The start decision comes from the
 * API, so the disabled button and the 409 share one source of truth.
 */
export default async function StudentQuizDetailPage({ params }: PageProps) {
  const { id } = await params;
  const decision = decideAccess(await getSession(), 'STUDENT', `/student/quizzes/${id}`);
  if (!decision.allowed) redirect(decision.redirectTo);

  let detail: StudentQuizDetailResponse | null = null;
  let unreachable = false;

  try {
    const api = await serverApi();
    const res = await api.api.student.quizzes[':id'].$get({ param: { id } });

    // The RPC type only knows the declared 200; other statuses arrive at runtime.
    if ((res.status as number) === 404) notFound();
    if (res.ok) detail = await res.json();
  } catch {
    unreachable = true;
  }

  if (unreachable || !detail) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm font-medium">This quiz could not be loaded.</p>
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

  const { quiz, start } = detail;
  const resuming = Boolean(quiz.inProgressAttemptId);

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <Link
          href="/student/quizzes"
          className="cine-label inline-flex items-center gap-1.5 text-[9px] text-gray-400 transition-colors hover:text-white"
        >
          <ArrowLeft aria-hidden className="size-3" />
          Quizzes
        </Link>

        <PageHeader
          label="Student · the paper"
          title={quiz.title}
          description={quiz.description ?? undefined}
          aside={
            <>
              <Badge variant={difficultyTone(quiz.difficulty)} className="text-[9.5px]">
                {quiz.difficulty}
              </Badge>
              <Badge variant="outline" className="text-[9.5px]">
                {quiz.categoryName}
              </Badge>
              {resuming ? (
                <Badge variant="warning" className="text-[9.5px]">
                  in progress
                </Badge>
              ) : null}
            </>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ListChecks className="text-primary size-4" />
              What to expect
            </CardTitle>
            <CardDescription>
              The clock starts when you press start and is enforced by the server — reloading or
              closing the tab does not pause it.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-3 text-[13px] sm:grid-cols-2">
            <div className="border-border/60 flex items-start gap-2.5 rounded-lg border p-3">
              <HelpCircle className="text-primary mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">{quiz.questionCount} questions</p>
                <p className="text-muted-foreground text-[11.5px]">
                  {quiz.totalMarks} marks in total · multiple choice
                </p>
              </div>
            </div>

            <div className="border-border/60 flex items-start gap-2.5 rounded-lg border p-3">
              <Clock className="text-primary mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">{formatDuration(quiz.durationMinutes)}</p>
                <p className="text-muted-foreground text-[11.5px]">
                  one sitting, counted down from the server
                </p>
              </div>
            </div>

            <div className="border-border/60 flex items-start gap-2.5 rounded-lg border p-3">
              <Target className="text-primary mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Pass at {quiz.passingScore}%</p>
                <p className="text-muted-foreground text-[11.5px]">
                  scored by the backend when you submit
                </p>
              </div>
            </div>

            <div className="border-border/60 flex items-start gap-2.5 rounded-lg border p-3">
              <Trophy className="text-primary mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">{bestScoreLabel(quiz)}</p>
                <p className="text-muted-foreground text-[11.5px]">{attemptsLabel(quiz)}</p>
              </div>
            </div>

            <div className="border-border/60 flex items-start gap-2.5 rounded-lg border p-3">
              <MinusCircle className="text-primary mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {quiz.negativeMarks > 0
                    ? `−${quiz.negativeMarks} per wrong answer`
                    : 'No penalty for wrong answers'}
                </p>
                <p className="text-muted-foreground text-[11.5px]">
                  {quiz.negativeMarks > 0
                    ? 'unanswered questions cost nothing'
                    : 'a wrong guess costs nothing extra'}
                </p>
              </div>
            </div>

            {quiz.availableFrom || quiz.availableUntil ? (
              <div className="border-border/60 flex items-start gap-2.5 rounded-lg border p-3">
                <CalendarClock className="text-primary mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    {quiz.availability === 'SCHEDULED'
                      ? 'Not open yet'
                      : quiz.availability === 'CLOSED'
                        ? 'Closed'
                        : 'Open now'}
                  </p>
                  <p className="text-muted-foreground text-[11.5px]">
                    {quiz.availableFrom
                      ? `opens ${new Date(quiz.availableFrom).toLocaleString()}`
                      : 'no opening date'}
                    {' · '}
                    {quiz.availableUntil
                      ? `closes ${new Date(quiz.availableUntil).toLocaleString()}`
                      : 'no closing date'}
                  </p>
                </div>
              </div>
            ) : null}

            {quiz.certificateEnabled ? (
              <div className="border-border/60 flex items-start gap-2.5 rounded-lg border p-3">
                <Award className="text-primary mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-medium">Certificate on a pass</p>
                  <p className="text-muted-foreground text-[11.5px]">
                    with a public code anyone can verify
                  </p>
                </div>
              </div>
            ) : null}

            <p className="text-muted-foreground border-border/60 rounded-lg border border-dashed p-3 text-[11.5px] sm:col-span-2">
              <ShieldCheck className="text-success mr-1 inline size-3.5" />
              Answers are saved as you select them, and the answer key never reaches your browser.
              Submit — or let the countdown do it — and the backend grades the paper.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {resuming ? 'Pick up where you left off' : 'Ready to begin?'}
              </CardTitle>
              <CardDescription className="text-[12px]">
                {resuming
                  ? 'Your attempt is still running. Resuming does not use another try.'
                  : `${quiz.attemptsRemaining} of ${quiz.maxAttempts} attempt${quiz.maxAttempts === 1 ? '' : 's'} remaining.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <StartQuizButton quizId={quiz.id} resuming={resuming} disabled={!start.allowed} />

              {!start.allowed && start.message ? (
                <p className="border-border/60 text-muted-foreground flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {start.message}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {resuming ? (
            <Card>
              <CardContent className="py-4 text-[12px]">
                <Link
                  href={`/student/attempt/${quiz.inProgressAttemptId}`}
                  className="text-primary hover:underline"
                >
                  Open the running attempt →
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
