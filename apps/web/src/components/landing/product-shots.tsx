import type { LandingPayload } from '@quiz/shared/landing';
import { durationLabel } from '@quiz/shared/landing';
import { Check, Clock, Lock, Timer } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Product shots, built from the payload.
 *
 * Each one renders rows that came out of the database a moment ago: a real
 * question from the fullest published quiz, a real graded paper, the real
 * catalogue. None of them has a fallback string — when there is no data the shot
 * says so, because inventing a plausible quiz on a page that claims to be live is
 * the one thing worse than an empty state.
 */

const DIFFICULTY_BADGE = {
  EASY: 'success',
  MEDIUM: 'secondary',
  HARD: 'warning',
} as const;

function Empty({ children }: { children: string }) {
  return (
    <div className="border-border/60 text-muted-foreground grid h-32 place-items-center rounded-md border border-dashed text-[11px]">
      {children}
    </div>
  );
}

export function AttemptShot({ payload }: { payload: LandingPayload | null }) {
  const question = payload?.sampleQuestion;

  if (!question) return <Empty>No published question to show yet.</Empty>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-medium">{question.quizTitle}</p>
          <p className="text-muted-foreground text-[10.5px]">
            Question {question.index} of {question.total} · {question.category}
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 font-mono text-[10px] tabular-nums">
          <Clock className="size-3" />
          {question.durationMinutes}:00
        </Badge>
      </div>

      <div className="bg-muted h-1 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.round((question.index / question.total) * 100)}%` }}
        />
      </div>

      <p className="text-[12.5px] leading-relaxed">{question.text}</p>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {question.options.map((option) => (
          <li
            key={option}
            className="border-border/70 bg-background/40 text-muted-foreground flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11.5px]"
          >
            <span
              className="border-border grid size-3.5 shrink-0 place-items-center rounded-full border"
              aria-hidden
            />
            <span className="truncate">{option}</span>
          </li>
        ))}
      </ul>

      <div className="text-muted-foreground flex items-center justify-between gap-2 text-[10px]">
        <span className="inline-flex items-center gap-1">
          <Timer className="size-2.5" />
          {question.marks} mark{question.marks === 1 ? '' : 's'}
        </span>
        <span className="flex items-center gap-1.5">
          <Lock className="size-2.5" /> key not in this payload
        </span>
      </div>
    </div>
  );
}

export function ResultShot({ payload }: { payload: LandingPayload | null }) {
  const result = payload?.sampleResult;

  if (!result) return <Empty>No graded paper yet.</Empty>;

  const cells = [
    { label: 'Right', value: result.correct, tone: 'success' as const },
    { label: 'Wrong', value: result.incorrect, tone: 'destructive' as const },
    { label: 'Blank', value: result.unanswered, tone: 'muted' as const },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
            {result.quizTitle}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {Math.round(result.percentage)}
            </span>
            <span className="text-muted-foreground text-sm">%</span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-[10.5px]">
            {result.marks} of {result.totalMarks} marks · {durationLabel(result.timeTakenSeconds)}
          </p>
        </div>
        <Badge variant={result.passed ? 'success' : 'destructive'} className="text-[10px]">
          {result.passed ? 'PASSED' : 'FAILED'}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className={cn(
              'rounded-md border px-1.5 py-1.5 text-center',
              cell.tone === 'success' && 'border-success/35 bg-success/10',
              cell.tone === 'destructive' && 'border-destructive/35 bg-destructive/10',
              cell.tone === 'muted' && 'border-border/60 bg-muted/30',
            )}
          >
            <div className="font-mono text-[13px] tabular-nums">{cell.value}</div>
            <div className="text-muted-foreground text-[9px] tracking-wide uppercase">
              {cell.label}
            </div>
          </div>
        ))}
      </div>

      <p className="text-muted-foreground flex items-center gap-1.5 text-[10px]">
        <Check className="text-success size-2.5" />
        pass mark {result.passingScore}% · graded on the server
      </p>
    </div>
  );
}

export function CatalogueShot({ payload }: { payload: LandingPayload | null }) {
  const quizzes = payload?.quizzes ?? [];

  if (quizzes.length === 0) return <Empty>Nothing published yet.</Empty>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium">Catalogue</span>
        <span className="text-muted-foreground font-mono text-[9.5px]">
          {quizzes.length} published
        </span>
      </div>

      <ul className="space-y-1.5">
        {quizzes.slice(0, 3).map((quiz) => (
          <li
            key={quiz.title}
            className="border-border/60 bg-background/40 rounded-md border px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11.5px] font-medium">{quiz.title}</span>
              <Badge variant={DIFFICULTY_BADGE[quiz.difficulty]} className="shrink-0 text-[8.5px]">
                {quiz.difficulty.toLowerCase()}
              </Badge>
            </div>
            <div className="text-muted-foreground mt-1 flex items-center gap-2 text-[9.5px]">
              <span className="truncate">{quiz.category}</span>
              <span className="bg-border size-0.5 shrink-0 rounded-full" />
              <span className="tabular-nums">{quiz.durationMinutes} min</span>
              <span className="bg-border size-0.5 shrink-0 rounded-full" />
              <span className="tabular-nums">
                {quiz.questions} Q · {quiz.maxAttempts} {quiz.maxAttempts === 1 ? 'try' : 'tries'}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {quizzes.length > 3 ? (
        <p className="text-muted-foreground/70 text-[9.5px]">
          + {quizzes.length - 3} more in the catalogue
        </p>
      ) : null}
    </div>
  );
}

export function ConsoleShot({ payload }: { payload: LandingPayload | null }) {
  if (!payload) return <Empty>Waiting for the API.</Empty>;

  const { counts, categories, shape } = payload;
  const peak = Math.max(1, ...categories.map((category) => category.published));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        {[
          [String(counts.users), 'users'],
          [String(counts.quizzes), 'quizzes'],
          [String(counts.questions), 'questions'],
        ].map(([value, label]) => (
          <div
            key={label}
            className="border-border/60 bg-background/40 rounded-md border px-2 py-1.5"
          >
            <div className="text-base font-semibold tabular-nums">{value}</div>
            <div className="text-muted-foreground text-[9.5px]">{label}</div>
          </div>
        ))}
      </div>

      <div className="border-border/60 bg-background/40 rounded-md border p-2">
        <div className="text-muted-foreground mb-1.5 flex justify-between text-[9.5px]">
          <span>Published per category</span>
          <span className="tabular-nums">{shape.totalQuestions} questions</span>
        </div>
        <div className="flex h-10 items-end gap-1" aria-hidden>
          {categories.slice(0, 10).map((category) => (
            <span
              key={category.name}
              title={`${category.name}: ${category.published} published`}
              style={{ height: `${Math.max(6, (category.published / peak) * 100)}%` }}
              className={cn(
                'flex-1 rounded-sm',
                category.published > 0 ? 'bg-primary/60' : 'bg-border/60',
              )}
            />
          ))}
        </div>
      </div>

      <ul className="divide-border/50 divide-y">
        {categories
          .filter((category) => category.published > 0)
          .slice(0, 3)
          .map((category) => (
            <li key={category.name} className="flex items-center justify-between gap-2 py-1.5">
              <span className="truncate text-[11px]">{category.name}</span>
              <span className="text-muted-foreground shrink-0 font-mono text-[9.5px] tabular-nums">
                {category.published} / {category.quizzes}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
