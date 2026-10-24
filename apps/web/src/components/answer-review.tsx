import type { AttemptReview, ReviewFilter, ReviewQuestion } from '@quiz/shared/review';
import { verdictMatchesFilter } from '@quiz/shared/review';
import { QUESTION_TYPE_LABELS, isMultiSelect, type QuestionType } from '@quiz/shared/question-type';
import { CircleCheck, CircleX, Clock, Code2, Info, MinusCircle } from 'lucide-react';
import Link from 'next/link';

import { FormatBreakdownList } from '@/components/format-breakdown';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { difficultyTone } from '@/lib/quiz-params';
import { formatPercentage } from '@/lib/student-params';
import {
  reviewFilterOptions,
  reviewHref,
  reviewMarksLabel,
  reviewPositionLabel,
  reviewScoreLabel,
  reviewSelectionLabel,
  verdictLabel,
  verdictTone,
} from '@/lib/review-params';
import { cn } from '@/lib/utils';

interface Props {
  review: AttemptReview;
  filter: ReviewFilter;
}

const VERDICT_ICON = {
  CORRECT: CircleCheck,
  INCORRECT: CircleX,
  UNANSWERED: MinusCircle,
} as const;

function QuestionCard({
  question,
  index,
  total,
}: {
  question: ReviewQuestion;
  index: number;
  total: number;
}) {
  const Icon = VERDICT_ICON[question.verdict];
  const typed = question.type === 'FILL_BLANK';
  const selected = question.options.find((option) => option.selected) ?? null;
  const correct = question.options.find((option) => option.isCorrect) ?? null;
  // What the student actually gave: a set on a checkbox question, their text on
  // a fill-in-the-blank, one option otherwise.
  const given = typed
    ? (question.answerText ?? '')
    : question.options
        .filter((option) => option.selected)
        .map((option) => option.text)
        .join(', ');

  return (
    <Card
      className={cn(
        'overflow-hidden',
        question.verdict === 'CORRECT' && 'border-success/35',
        question.verdict === 'INCORRECT' && 'border-destructive/35',
      )}
    >
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground font-mono text-[11px]">
            {reviewPositionLabel(index, total)}
          </span>
          <Badge variant={difficultyTone(question.difficulty)} className="text-[9.5px]">
            {question.difficulty}
          </Badge>
          <Badge variant="outline" className="text-[9.5px]">
            {QUESTION_TYPE_LABELS[question.type as QuestionType]}
          </Badge>
          <Badge variant={verdictTone(question.verdict)} className="gap-1.5">
            <Icon className="size-3" />
            {verdictLabel(question.verdict)}
          </Badge>
          <span className="text-muted-foreground ml-auto font-mono text-[10.5px]">
            {reviewMarksLabel(question.verdict, question.marks)}
          </span>
        </div>

        {question.imageUrl ? (
          <figure className="border-border/70 overflow-hidden rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={question.imageUrl}
              alt="Figure for this question"
              className="max-h-64 w-full object-contain"
              loading="lazy"
            />
          </figure>
        ) : null}

        {question.codeSnippet ? (
          <div className="border-border/70 bg-muted/30 overflow-x-auto rounded-lg border">
            <div className="text-muted-foreground border-border/60 flex items-center gap-1.5 border-b px-3 py-1.5 text-[10px] tracking-wide uppercase">
              <Code2 className="size-3" /> code
            </div>
            <pre className="px-3 py-2 text-[12px] leading-relaxed">
              <code>{question.codeSnippet}</code>
            </pre>
          </div>
        ) : null}

        <p className="text-[14.5px] leading-snug font-medium">{question.questionText}</p>

        {typed ? (
          <div className="space-y-2 text-[12.5px]">
            <div
              className={cn(
                'rounded-lg border px-3 py-2',
                question.verdict === 'CORRECT'
                  ? 'border-success/40 bg-success/10'
                  : question.verdict === 'INCORRECT'
                    ? 'border-destructive/40 bg-destructive/10'
                    : 'border-border/60',
              )}
            >
              <p className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
                your answer
              </p>
              <p className="mt-0.5 font-medium">
                {question.answerText?.trim() ? question.answerText : 'left blank'}
              </p>
            </div>

            <div className="border-success/30 bg-success/5 rounded-lg border px-3 py-2">
              <p className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
                accepted
              </p>
              <p className="mt-0.5">{question.options.map((option) => option.text).join(' · ')}</p>
            </div>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {question.options.map((option, optionIndex) => {
              const isCorrect = option.isCorrect;
              const isPicked = option.selected;

              return (
                <li
                  key={option.id}
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg border px-3 py-2 text-[12.5px]',
                    isCorrect && 'border-success/40 bg-success/10',
                    !isCorrect && isPicked && 'border-destructive/40 bg-destructive/10',
                    !isCorrect && !isPicked && 'border-border/60',
                  )}
                >
                  <span className="text-muted-foreground mt-0.5 font-mono text-[10.5px]">
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  <span className="flex-1">{option.text}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {isPicked ? (
                      <span
                        className={cn(
                          'font-mono text-[10px] tracking-wide uppercase',
                          isCorrect ? 'text-success' : 'text-destructive',
                        )}
                      >
                        your answer
                      </span>
                    ) : null}
                    {isCorrect ? (
                      <span className="text-success inline-flex items-center gap-1 font-mono text-[10px] tracking-wide uppercase">
                        <CircleCheck className="size-3" />
                        correct
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p
          className={cn(
            'text-[11.5px]',
            question.verdict === 'CORRECT' ? 'text-success' : 'text-muted-foreground',
          )}
        >
          {typed
            ? question.verdict === 'CORRECT'
              ? 'That matches an accepted answer.'
              : question.verdict === 'UNANSWERED'
                ? 'You left this one blank.'
                : `Not quite — ${question.options.map((option) => option.text).join(' or ')} would have scored.`
            : isMultiSelect(question.type as QuestionType)
              ? question.verdict === 'CORRECT'
                ? 'Every correct option, and nothing else.'
                : question.verdict === 'UNANSWERED'
                  ? 'You left this one blank.'
                  : `You picked ${given || 'nothing'}. The full set is needed: ${question.options
                      .filter((option) => option.isCorrect)
                      .map((option) => option.text)
                      .join(', ')}.`
              : reviewSelectionLabel(
                  question.verdict,
                  selected?.text ?? null,
                  correct?.text ?? null,
                )}
        </p>

        {question.explanation ? (
          <div className="border-border/70 bg-muted/30 flex items-start gap-2 rounded-lg border px-3 py-2">
            <Info className="text-primary mt-0.5 size-3.5 shrink-0" />
            <p className="text-[12px] leading-relaxed">
              <span className="font-medium">Why:</span> {question.explanation}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-[11px]">
            No explanation was written for this one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The answer review.
 *
 * This is the first screen that is allowed to know the answer key, and it only
 * ever renders for a finished attempt (the API enforces that). Filtering happens
 * here on the server from the URL, so the same link is shareable and a reload
 * keeps the view.
 */
export function AnswerReview({ review, filter }: Props) {
  const counts = review.counts;
  // Keep the paper's own numbering even when a filter hides questions.
  const visible = review.questions
    .map((question, index) => ({ question, index }))
    .filter((entry) => verdictMatchesFilter(entry.question.verdict, filter));
  const options = reviewFilterOptions(counts);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="cine-label text-[9px] text-gray-500">
                {review.quiz.categoryName} · {review.quiz.difficulty.toLowerCase()}
              </p>
              <h1 className="font-display mt-1.5 text-[1.6rem] leading-tight font-light tracking-tight text-white">
                {review.quiz.title}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={review.result.passed ? 'success' : 'destructive'}>
                {formatPercentage(review.result.percentage)} ·{' '}
                {review.result.passed ? 'Passed' : 'Failed'}
              </Badge>
              {review.attempt.autoSubmitted ? (
                <Badge variant="outline" className="gap-1.5">
                  <Clock className="size-3" />
                  auto-submitted
                </Badge>
              ) : null}
            </div>
          </div>

          <p className="text-muted-foreground text-[12.5px]">
            {reviewScoreLabel(counts.correct, counts.all)} · {review.result.score} of{' '}
            {review.result.totalMarks} marks · pass mark{' '}
            {formatPercentage(review.result.passingScore)} · took{' '}
            {Math.max(1, Math.round(review.attempt.timeTakenSeconds / 60))} min
          </p>

          <FormatBreakdownList
            formats={review.result.formats}
            className="border-border/70 bg-background/40 rounded-lg border px-3 py-2"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            {options.map((option) => {
              const active = option.value === filter;

              return (
                <Link
                  key={option.value}
                  href={reviewHref(review.attempt.id, option.value)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors',
                    active
                      ? 'border-primary/40 bg-primary/15 text-primary'
                      : 'border-border/70 text-muted-foreground hover:bg-accent/50',
                  )}
                >
                  {option.label} <span className="tabular-nums">{option.count}</span>
                </Link>
              );
            })}

            <Link
              href={`/student/attempt/${review.attempt.id}`}
              className="text-muted-foreground hover:text-foreground ml-auto text-[11.5px] underline underline-offset-2"
            >
              Back to the score
            </Link>
          </div>
        </CardContent>
      </Card>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm">
            Nothing in this filter.{' '}
            <Link href={reviewHref(review.attempt.id)} className="text-primary hover:underline">
              Show every question
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map(({ question, index }) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={index}
              total={review.questions.length}
            />
          ))}
        </div>
      )}
    </div>
  );
}
