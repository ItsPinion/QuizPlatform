import type { AttemptResult } from '@quiz/shared/submission';
import { CircleCheck, CircleX, Clock, ListChecks, Timer, Trophy } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  autoSubmitNote,
  formatPercentage,
  resultHeadline,
  resultSummary,
  resultTone,
  scoreFraction,
  timeTakenLabel,
} from '@/lib/student-params';
import { cn } from '@/lib/utils';

interface Props {
  result: AttemptResult;
  quizTitle: string;
  /** Where "Detailed review" will live from Day 9; hidden while it does not exist. */
  showReviewLink?: boolean;
}

/**
 * The graded summary of an attempt.
 *
 * Everything here comes from the submission response — the browser never
 * recomputes a score, it only formats what the server stored. The per-question
 * review (correct answers and explanations) is the Day 9 screen; this card is
 * the verdict, the counts and the time.
 */
export function AttemptResultCard({ result, quizTitle, showReviewLink = false }: Props) {
  const tone = resultTone(result.passed);
  const note = autoSubmitNote(result.autoSubmitted);

  const stats = [
    { label: 'Correct', value: result.correctAnswers, icon: CircleCheck, tone: 'success' },
    { label: 'Incorrect', value: result.incorrectAnswers, icon: CircleX, tone: 'destructive' },
    { label: 'Unanswered', value: result.unanswered, icon: ListChecks, tone: 'muted' },
    {
      label: 'Time taken',
      value: timeTakenLabel(result.timeTakenSeconds),
      icon: Timer,
      tone: 'muted',
    },
  ] as const;

  return (
    <div className="space-y-4">
      <Card className={cn(result.passed ? 'border-success/40' : 'border-destructive/40')}>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="outline">Result</Badge>
            <Badge variant={tone}> {resultHeadline(result)} </Badge>
          </div>
          <CardTitle className="mt-2 text-lg">{quizTitle}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <span
              className={cn(
                'text-4xl font-semibold tracking-tight tabular-nums',
                result.passed ? 'text-success' : 'text-destructive',
              )}
              aria-label={resultSummary(result)}
            >
              {formatPercentage(result.percentage)}
            </span>
            <span className="text-muted-foreground pb-1 text-[12.5px]">
              {scoreFraction(result)} · pass mark {formatPercentage(result.passingScore)}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="border-border/70 bg-background/40 flex items-center gap-2.5 rounded-lg border px-3 py-2"
              >
                <stat.icon
                  className={cn(
                    'size-3.5 shrink-0',
                    stat.tone === 'success' && 'text-success',
                    stat.tone === 'destructive' && 'text-destructive',
                    stat.tone === 'muted' && 'text-muted-foreground',
                  )}
                />
                <div className="min-w-0">
                  <p className="text-muted-foreground text-[10.5px] tracking-wider uppercase">
                    {stat.label}
                  </p>
                  <p className="text-[13px] font-medium tabular-nums">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          {note ? (
            <p className="border-warning/40 bg-warning/10 text-warning flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]">
              <Clock className="mt-0.5 size-3.5 shrink-0" />
              {note}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link href="/student/quizzes" className={cn(buttonVariants({ size: 'sm' }))}>
              <Trophy />
              Take another quiz
            </Link>

            {showReviewLink ? (
              <Button variant="outline" size="sm" disabled title="Answer review arrives in Day 9">
                Detailed review
              </Button>
            ) : null}

            <span className="text-muted-foreground ml-auto text-[11px]">
              Graded on the server · no answer key in this payload
            </span>
          </div>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-[11.5px] leading-relaxed">
        This score is stored on the attempt row — marks, counts, percentage, pass/fail and time
        taken. <span className="text-foreground">Answer review with explanations</span> lands in Day
        9; nothing here is computed in the browser.
      </p>
    </div>
  );
}
