import type { StudentQuiz } from '@quiz/shared/attempt';
import { ArrowRight, Clock, HelpCircle, Play, RotateCcw, Target, Trophy } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { attemptsLabel, bestScoreLabel, startLabel, startState } from '@/lib/student-params';
import { difficultyTone, formatDuration } from '@/lib/quiz-params';
import { cn } from '@/lib/utils';

/** Catalogue tile. The button label is decided by the same rule the API applies. */
export function StudentQuizCard({ quiz }: { quiz: StudentQuiz }) {
  const state = startState(quiz);
  const resumable = state === 'resume';

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={difficultyTone(quiz.difficulty)} className="text-[9.5px]">
            {quiz.difficulty}
          </Badge>
          <Badge variant="outline" className="text-[9.5px]">
            {quiz.categoryName}
          </Badge>
          {resumable ? (
            <Badge variant="warning" className="text-[9.5px]">
              in progress
            </Badge>
          ) : null}
        </div>

        <CardTitle className="mt-1 text-[15px] leading-snug">{quiz.title}</CardTitle>
        {quiz.description ? (
          <p className="text-muted-foreground line-clamp-2 text-[12px]">{quiz.description}</p>
        ) : null}
      </CardHeader>

      <CardContent className="mt-auto space-y-3">
        <dl className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="size-3.5" />
            <dt className="sr-only">Questions</dt>
            <dd>{quiz.questionCount} questions</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5" />
            <dt className="sr-only">Duration</dt>
            <dd>{formatDuration(quiz.durationMinutes)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Target className="size-3.5" />
            <dt className="sr-only">Pass mark</dt>
            <dd>pass at {quiz.passingScore}%</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Trophy className="size-3.5" />
            <dt className="sr-only">Best score</dt>
            <dd>{bestScoreLabel(quiz)}</dd>
          </div>
        </dl>

        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-[11px]">{attemptsLabel(quiz)}</span>

          <Link
            href={`/student/quizzes/${quiz.id}`}
            className={cn(
              buttonVariants({
                variant: state === 'start' || resumable ? 'default' : 'outline',
                size: 'sm',
              }),
            )}
          >
            {resumable ? <RotateCcw /> : state === 'start' ? <Play /> : <ArrowRight />}
            {startLabel(state)}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
