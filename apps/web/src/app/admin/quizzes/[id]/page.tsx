import type { QuestionListResponse } from '@quiz/shared/question';

import { BuildBadge } from '@/components/build-badge';
import { PageHeader } from '@/components/cinema/page-header';
import type { CategoryListResponse, QuizDetailResponse } from '@quiz/shared/quiz';
import { ArrowLeft, CalendarClock, EyeOff, ListChecks, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { QuizActions } from '@/components/quiz-actions';
import { QuizPublishButton } from '@/components/quiz-publish-button';
import { QuizForm } from '@/components/quiz-form';
import { QuestionsPanel } from '@/components/questions-panel';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { formatDuration, statusTone } from '@/lib/quiz-params';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Quiz — Admin console' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminQuizPage({ params }: PageProps) {
  const { id } = await params;
  const decision = decideAccess(await getSession(), 'ADMIN', `/admin/quizzes/${id}`);
  if (!decision.allowed) redirect(decision.redirectTo);

  let quiz: QuizDetailResponse['quiz'] | null = null;
  let categories: CategoryListResponse['categories'] = [];
  let questions: QuestionListResponse['questions'] = [];
  let unreachable = false;

  try {
    const api = await serverApi();
    const [quizRes, categoryRes, questionRes] = await Promise.all([
      api.api.admin.quizzes[':id'].$get({ param: { id } }),
      api.api.admin.categories.$get(),
      api.api.admin.quizzes[':quizId'].questions.$get({ param: { quizId: id } }),
    ]);

    // The RPC type only knows the declared 200; error statuses arrive at runtime.
    if ((quizRes.status as number) === 404) notFound();
    if (quizRes.ok) quiz = (await quizRes.json()).quiz;
    if (categoryRes.ok) categories = (await categoryRes.json()).categories;
    if (questionRes.ok) questions = (await questionRes.json()).questions;
  } catch {
    unreachable = true;
  }

  if (unreachable || !quiz) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm font-medium">This quiz could not be loaded.</p>
          <p className="text-muted-foreground mt-1 text-[12.5px]">
            Check the API on port 3001, then{' '}
            <Link href="/admin/quizzes" className="text-primary hover:underline">
              return to the list
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <Link
          href="/admin/quizzes"
          className="cine-label inline-flex items-center gap-1.5 text-[9px] text-gray-400 transition-colors hover:text-white"
        >
          <ArrowLeft aria-hidden className="size-3" />
          Quizzes
        </Link>

        <PageHeader
          label="Admin console · authoring"
          title={quiz.title}
          aside={
            <>
              <Badge variant="warning" className="gap-1.5">
                <ShieldCheck />
                ADMIN
              </Badge>
              <Badge variant={statusTone(quiz.status)}>{quiz.status}</Badge>
              <BuildBadge>Day 6 · question authoring</BuildBadge>
            </>
          }
        />

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tracking-[0.1em] text-gray-400 uppercase">
          <span className="font-mono">{quiz.slug}</span>
          <span aria-hidden="true">·</span>
          <span>{quiz.categoryName}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDuration(quiz.durationMinutes)}</span>
          <span aria-hidden="true">·</span>
          <span>pass at {quiz.passingScore}%</span>
          <span aria-hidden="true">·</span>
          <span>
            {quiz.questionCount} question{quiz.questionCount === 1 ? '' : 's'}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {quiz.attemptCount} attempt{quiz.attemptCount === 1 ? '' : 's'}
          </span>
          {quiz.negativeMarks > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>−{quiz.negativeMarks} per wrong</span>
            </>
          ) : null}
          {quiz.shuffleQuestions ? (
            <>
              <span aria-hidden="true">·</span>
              <span>questions shuffled</span>
            </>
          ) : null}
          {quiz.shuffleOptions ? (
            <>
              <span aria-hidden="true">·</span>
              <span>options shuffled</span>
            </>
          ) : null}
          {quiz.availableFrom || quiz.availableUntil ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {quiz.availableFrom
                  ? `opens ${new Date(quiz.availableFrom).toLocaleDateString()}`
                  : 'always open'}
                {quiz.availableUntil
                  ? ` until ${new Date(quiz.availableUntil).toLocaleDateString()}`
                  : ''}
              </span>
            </>
          ) : null}
        </p>
      </div>

      {quiz.status !== 'PUBLISHED' ? (
        <div className="flex flex-col gap-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <div>
              <p className="text-[13.5px] font-medium text-amber-100">
                {quiz.status === 'DRAFT' ? 'Draft' : 'Unpublished'} — students cannot see this quiz
              </p>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-amber-200/80">
                {quiz.questionCount === 0
                  ? 'It has no questions yet. Add the first one below, then publish — the catalogue only ever lists published quizzes.'
                  : `It has ${quiz.questionCount} question${quiz.questionCount === 1 ? '' : 's'} ready. Publishing puts it in the student catalogue immediately; nothing else has to change.`}
              </p>
            </div>
          </div>
          <QuizPublishButton
            quizId={quiz.id}
            questionCount={quiz.questionCount}
            size="lg"
            label="Publish now"
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader>
            <CardTitle>Quiz details</CardTitle>
            <CardDescription>
              Changes save through <code className="bg-muted rounded px-1">PATCH</code> and are
              validated by the same schema the API uses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuizForm categories={categories} quiz={quiz} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lifecycle</CardTitle>
              <CardDescription>
                {quiz.status === 'PUBLISHED'
                  ? 'Live: it is in the student catalogue now. Unpublishing hides it again without touching its questions or its history.'
                  : 'Only published quizzes reach students. Publishing is instant and reversible.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QuizActions quiz={quiz} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarClock className="text-primary size-4" />
                Record
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-1.5 text-[12px]">
              <p>
                Created{' '}
                <span className="text-foreground">
                  {new Date(quiz.createdAt).toLocaleString(undefined, {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </p>
              <p>
                Updated{' '}
                <span className="text-foreground">
                  {new Date(quiz.updatedAt).toLocaleString(undefined, {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </p>
              <p className="truncate font-mono text-[11px]">{quiz.id}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="text-primary size-4" />
            Questions
          </CardTitle>
          <CardDescription>
            Multiple choice, multiple answers, true/false or fill in the blank — and any of them can
            carry an image or a code block. Marks, difficulty and the explanation travel with the
            question; position is the order students will see.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuestionsPanel quizId={quiz.id} quizStatus={quiz.status} initialQuestions={questions} />
        </CardContent>
      </Card>
    </div>
  );
}
