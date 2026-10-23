import { CircleCheck, CircleX, Info, KeyRound, ListChecks, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { letter: 'A', text: 'var', state: 'neutral' },
  { letter: 'B', text: 'let', state: 'picked' },
  { letter: 'C', text: 'const', state: 'correct' },
  { letter: 'D', text: 'static', state: 'neutral' },
] as const;

const CAPABILITIES = [
  {
    icon: ShieldCheck,
    title: 'The key only exists after submission',
    body: 'Reviewing a live attempt answers 409 ATTEMPT_NOT_ACTIVE. Correctness and explanations first appear once the paper is closed — there is no window where devtools beats the exam.',
  },
  {
    icon: KeyRound,
    title: 'Three verdicts, never two',
    body: 'Correct, incorrect and unanswered stay separate: a blank question is not a wrong guess, and the review counts match the score stored by the Day 8 grader exactly.',
  },
  {
    icon: ListChecks,
    title: 'History is the same rows',
    body: 'Every attempt is listed with its score, counts and time, filterable by status and sortable by score — and each finished row links straight into its own review.',
  },
];

/** Landing-page preview of Day 9; the live screens are /student/results and …/review. */
export function AnswerReviewPreview() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="border-border/70 bg-muted/20 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <span className="text-muted-foreground font-mono text-[11px]">
              /student/attempt/:id/review
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
              {[
                ['All', '10'],
                ['Correct', '6'],
                ['Incorrect', '3'],
                ['Unanswered', '1'],
              ].map(([label, count], index) => (
                <span
                  key={label}
                  className={cn(
                    'rounded-full border px-2 py-0.5',
                    index === 2
                      ? 'border-primary/40 bg-primary/15 text-primary'
                      : 'border-border/70 text-muted-foreground',
                  )}
                >
                  {label} {count}
                </span>
              ))}
            </div>
          </div>

          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground font-mono text-[10.5px]">
                Question 3 of 10
              </span>
              <Badge variant="outline" className="text-[9.5px]">
                MEDIUM
              </Badge>
              <Badge variant="destructive" className="gap-1.5">
                <CircleX className="size-3" />
                Incorrect
              </Badge>
              <span className="text-muted-foreground ml-auto font-mono text-[10.5px]">
                0 of 2 marks
              </span>
            </div>

            <p className="text-[14px] leading-snug font-medium">
              Which declaration cannot be reassigned after initialisation?
            </p>

            <ul className="space-y-1.5">
              {OPTIONS.map((option) => (
                <li
                  key={option.letter}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[12.5px]',
                    option.state === 'correct' && 'border-success/40 bg-success/10',
                    option.state === 'picked' && 'border-destructive/40 bg-destructive/10',
                    option.state === 'neutral' && 'border-border/60',
                  )}
                >
                  <span className="text-muted-foreground font-mono text-[10.5px]">
                    {option.letter}
                  </span>
                  <span className="flex-1">{option.text}</span>
                  {option.state === 'picked' ? (
                    <span className="text-destructive font-mono text-[9.5px] tracking-wide uppercase">
                      your answer
                    </span>
                  ) : null}
                  {option.state === 'correct' ? (
                    <span className="text-success inline-flex items-center gap-1 font-mono text-[9.5px] tracking-wide uppercase">
                      <CircleCheck className="size-3" />
                      correct
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>

            <div className="border-border/70 bg-muted/30 flex items-start gap-2 rounded-lg border px-3 py-2">
              <Info className="text-primary mt-0.5 size-3.5 shrink-0" />
              <p className="text-[11.5px] leading-relaxed">
                <span className="font-medium">Why:</span> <code className="font-mono">const</code>{' '}
                binds a name for good; <code className="font-mono">let</code> and{' '}
                <code className="font-mono">var</code> can both be reassigned.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[12.5px]">/student/results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { title: 'JavaScript Fundamentals', score: '86%', tone: 'success' },
                { title: 'React Basics', score: '92%', tone: 'success' },
                { title: 'Python Programming', score: '48%', tone: 'destructive' },
                { title: 'SQL Databases', score: '—', tone: 'muted' },
              ].map((row) => (
                <div
                  key={row.title}
                  className="border-border/60 flex items-center gap-2 rounded-lg border px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium">{row.title}</p>
                    <p className="text-muted-foreground font-mono text-[10px]">
                      {row.tone === 'muted' ? 'still running' : 'review ready'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-[13px] font-semibold tabular-nums',
                      row.tone === 'success' && 'text-success',
                      row.tone === 'destructive' && 'text-destructive',
                      row.tone === 'muted' && 'text-muted-foreground',
                    )}
                  >
                    {row.score}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="py-4">
            <CardContent className="space-y-1">
              <p className="text-muted-foreground text-[10.5px] tracking-wider uppercase">
                Attempt history
              </p>
              <p className="text-2xl font-semibold tabular-nums">14</p>
              <p className="text-muted-foreground text-[11px]">
                8 passed · 4 failed · 2 in progress
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {CAPABILITIES.map((item) => (
          <Card key={item.title} className="py-4">
            <CardHeader className="pb-2">
              <item.icon className="text-primary mb-1.5 size-4" />
              <CardTitle className="text-[13px]">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-[12px] leading-relaxed">{item.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
