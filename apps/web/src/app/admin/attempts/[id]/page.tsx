import type { AdminAttemptDetailResponse } from '@quiz/shared/admin-attempts';
import { QUESTION_TYPE_LABELS } from '@quiz/shared/question-type';
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  Clock,
  Download,
  MinusCircle,
  UserRound,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { PageHeader } from '@/components/cinema/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverApi } from '@/lib/api-server';
import { decideAccess } from '@/lib/guards';
import { historyTone, historyWhen } from '@/lib/review-params';
import { getSession } from '@/lib/session';
import { formatPercentage } from '@/lib/student-params';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'One attempt — Admin console',
  description:
    'Every question of one attempt, the answer given and the answer that was right — in whichever format the question asked.',
};

/**
 * One attempt, from the administrator's side.
 *
 * It is the review screen with the receipt attached: the score, the penalty that
 * came off it and every question in the order the student actually saw. The
 * order matters — `attempts.question_order` is the dealt order, so this page can
 * answer "did the shuffle matter for this result?" rather than only "what did
 * they score?".
 *
 * Correct answers are marked here, unlike the student's view before submission.
 * That is the point of the screen: an administrator investigating a dispute needs
 * the key, not the paper as it was handed out.
 */
export default async function AdminAttemptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const decision = decideAccess(await getSession(), 'ADMIN', '/admin/attempts');
  if (!decision.allowed) redirect(decision.redirectTo);

  const { id } = await params;

  let data: AdminAttemptDetailResponse | null = null;

  try {
    const res = await (await serverApi()).api.admin.attempts[':id'].$get({ param: { id } });
    if (res.ok) data = await res.json();
  } catch {
    data = null;
  }

  if (!data) notFound();

  const { attempt, quiz, answers, penalty } = data;
  const correct = answers.filter((answer) => answer.isCorrect === true).length;
  const incorrect = answers.filter((answer) => answer.isCorrect === false).length;
  const unanswered = answers.length - correct - incorrect;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/attempts"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[12.5px] transition-colors"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        All attempts
      </Link>

      <PageHeader
        label={`${quiz.categoryName} · ${quiz.difficulty.toLowerCase()} · ${historyWhen(
          attempt.completedAt ?? attempt.startedAt,
        )}`}
        title={attempt.quizTitle}
        description={
          <>
            Sat by{' '}
            <Link
              href={`/admin/users/${attempt.userId}`}
              className="text-foreground underline underline-offset-4"
            >
              {attempt.userName}
            </Link>{' '}
            ({attempt.userEmail}).
          </>
        }
        aside={
          <>
            <Badge variant={historyTone(attempt.status)}>
              {attempt.status === 'IN_PROGRESS' ? 'In progress' : attempt.status}
            </Badge>
            {attempt.autoSubmitted ? <Badge variant="outline">Auto-submitted</Badge> : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Score',
            value: formatPercentage(attempt.percentage),
            hint: `${attempt.score} of ${attempt.totalMarks} marks`,
          },
          {
            label: 'Penalty',
            value: penalty === 0 ? '—' : `−${penalty}`,
            hint:
              quiz.negativeMarks === 0 ? 'Negative marking off' : `${quiz.negativeMarks} per wrong`,
          },
          {
            label: 'Answers',
            value: `${correct}✓ ${incorrect}✗ ${unanswered}–`,
            hint: 'correct · wrong · skipped',
          },
          {
            label: 'Time',
            value: `${Math.max(0, Math.round(attempt.timeTakenSeconds / 60))} min`,
            hint: `of ${quiz.negativeMarks === 0 ? 'the' : 'a'} timed sitting`,
          },
        ].map((tile) => (
          <Card key={tile.label} className="gap-2 py-4">
            <CardContent className="space-y-1">
              <p className="cine-label text-[9px] text-gray-400">{tile.label}</p>
              <p className="font-display text-[1.6rem] leading-none font-light tabular-nums">
                {tile.value}
              </p>
              <p className="text-muted-foreground text-[11px] leading-snug">{tile.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">The paper, in the order it was shown</CardTitle>
          <CardDescription className="text-[11.5px]">
            {quiz.shuffleQuestions
              ? 'Questions were shuffled'
              : 'Questions kept their authored order'}
            {quiz.shuffleOptions ? ', options shuffled' : ', options in authored order'}. Wrong
            answers cost {quiz.negativeMarks === 0 ? 'nothing' : `${quiz.negativeMarks} marks each`}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {answers.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-[12.5px]">
              This attempt was started but no question was ever answered.
            </p>
          ) : (
            <ol className="space-y-3">
              {answers.map((answer, index) => (
                <li key={answer.questionId} className="border-border/60 rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="text-muted-foreground mt-0.5 font-mono text-[11px] tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <p className="text-[13.5px] leading-relaxed font-medium">
                        {answer.questionText}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {QUESTION_TYPE_LABELS[answer.type]}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {answer.marks} {answer.marks === 1 ? 'mark' : 'marks'}
                      </Badge>
                      {answer.isCorrect === true ? (
                        <Badge variant="success" className="gap-1 text-[10px]">
                          <CircleCheck aria-hidden className="size-3" />
                          Correct
                        </Badge>
                      ) : answer.isCorrect === false ? (
                        <Badge variant="destructive" className="gap-1 text-[10px]">
                          <CircleX aria-hidden className="size-3" />
                          Wrong
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <MinusCircle aria-hidden className="size-3" />
                          Skipped
                        </Badge>
                      )}
                    </div>
                  </div>

                  {answer.type === 'FILL_BLANK' ? (
                    /* The options *are* the key here, so the card shows the typed
                       answer first and the accepted list underneath it — the same
                       order the student's review reads in. */
                    <div className="mt-3 space-y-2">
                      <div
                        className={cn(
                          'rounded-lg border px-3 py-2 text-[12.5px]',
                          answer.isCorrect === true
                            ? 'border-success/40 bg-success/10'
                            : answer.isCorrect === false
                              ? 'border-destructive/40 bg-destructive/10'
                              : 'border-border/60',
                        )}
                      >
                        <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
                          Typed answer
                        </p>
                        <p className="mt-0.5 font-mono">
                          {answer.answerText && answer.answerText.trim() !== ''
                            ? `“${answer.answerText}”`
                            : '— nothing typed'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
                          Accepted answers
                        </p>
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {answer.options.map((option) => (
                            <li
                              key={option.id}
                              className="border-success/40 bg-success/10 rounded-full border px-2 py-0.5 font-mono text-[11.5px]"
                            >
                              {option.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                      {answer.options.map((option) => {
                        const chosen =
                          option.id === answer.selectedOptionId ||
                          answer.selectedOptionIds.includes(option.id);

                        return (
                          <li
                            key={option.id}
                            className={cn(
                              'flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]',
                              option.isCorrect
                                ? 'border-success/40 bg-success/10'
                                : chosen
                                  ? 'border-destructive/40 bg-destructive/10'
                                  : 'border-border/60',
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                'mt-1.5 size-1.5 shrink-0 rounded-full',
                                option.isCorrect
                                  ? 'bg-success'
                                  : chosen
                                    ? 'bg-destructive'
                                    : 'bg-border',
                              )}
                            />
                            <span className="min-w-0 flex-1">{option.text}</span>
                            {chosen ? (
                              <span className="text-muted-foreground text-[10px] tracking-wider uppercase">
                                chosen
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {answer.explanation ? (
                    <p className="text-muted-foreground border-border/60 mt-2.5 border-l pl-3 text-[12px] leading-relaxed">
                      {answer.explanation}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/users/${attempt.userId}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <UserRound aria-hidden />
          This student&apos;s record
        </Link>
        <Link
          href={`/admin/quizzes/${quiz.id}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <Download aria-hidden />
          The quiz and its questions
        </Link>
        <Link
          href={`/admin/attempts?search=${encodeURIComponent(attempt.userEmail)}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          <Clock aria-hidden />
          Every attempt by this student
        </Link>
      </div>
    </div>
  );
}
