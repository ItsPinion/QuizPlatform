import { Clock, ListChecks, Lock, RotateCcw, ShieldCheck, Timer } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { text: 'var', selected: false },
  { text: 'let', selected: false },
  { text: 'const', selected: true },
  { text: 'static', selected: false },
];

const NAV = [1, 2, 3, 4, 5, 6, 7, 8];

const CAPABILITIES = [
  {
    icon: Timer,
    title: 'The server owns the clock',
    body: 'expiresAt is stamped when the attempt starts, and every answer write is checked against it. The countdown is re-derived from that timestamp — even after a refresh or a throttled background tab.',
  },
  {
    icon: Lock,
    title: 'The answer key never leaves the server',
    body: 'The attempt payload carries option text and positions only: no isCorrect flags, no explanations. There is nothing to read out of the network tab before submitting.',
  },
  {
    icon: RotateCcw,
    title: 'A refresh costs nothing',
    body: 'Answers save one selection at a time, and starting again resumes the same attempt instead of spending a try — the API returns the live attempt and its original deadline.',
  },
];

/** Landing-page preview of Day 7; the live screen is /student/quizzes → an attempt. */
export function StudentQuizInterface() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="border-border/70 bg-muted/20 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <span className="bg-primary/15 text-primary inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10.5px]">
              <ShieldCheck className="size-3" /> STUDENT
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">
              /student/attempt/:id
            </span>
            <span className="text-success ml-auto inline-flex items-center gap-1.5 font-mono text-[10.5px]">
              <span className="animate-pulse-dot bg-success size-1.5 rounded-full" />
              saved
            </span>
          </div>

          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium">JavaScript Fundamentals</span>
              <Badge variant="outline" className="gap-1.5 font-mono text-[10.5px]">
                <Clock className="size-3" />
                14:32
              </Badge>
            </div>

            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div className="bg-primary h-full w-[62%] rounded-full" />
            </div>

            <div>
              <p className="text-[12px] font-medium">Question 5 of 8</p>
              <p className="text-muted-foreground mt-0.5 text-[13px]">
                Which keyword is used to declare a constant?
              </p>
            </div>

            <ul className="grid gap-1.5 sm:grid-cols-2">
              {OPTIONS.map((option, index) => (
                <li
                  key={option.text}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px]',
                    option.selected
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/60 text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-3.5 shrink-0 place-items-center rounded-full border',
                      option.selected ? 'border-primary' : 'border-border',
                    )}
                  >
                    {option.selected ? <span className="bg-primary size-1.5 rounded-full" /> : null}
                  </span>
                  <span className="font-mono text-[10px]">{String.fromCharCode(65 + index)}</span>
                  <span className={cn('flex-1', option.selected && 'text-foreground')}>
                    {option.text}
                  </span>
                </li>
              ))}
            </ul>

            <div className="text-muted-foreground flex items-center justify-between text-[11px]">
              <span className="font-mono">← Previous</span>
              <span>5 of 8 answered</span>
              <span className="font-mono">Next →</span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[12.5px]">Question navigation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-4 gap-1.5">
                {NAV.map((number) => {
                  const answered = number < 5;
                  const current = number === 5;

                  return (
                    <span
                      key={number}
                      className={cn(
                        'grid h-7 place-items-center rounded-md border font-mono text-[11px]',
                        current && 'ring-primary ring-offset-background ring-2 ring-offset-1',
                        answered
                          ? 'border-primary/40 bg-primary/15 text-primary'
                          : 'border-border/70 text-muted-foreground',
                      )}
                    >
                      {number}
                    </span>
                  );
                })}
              </div>

              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Filled numbers are answered, outlined ones are not — a jump target, not a guess.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 py-4">
              <div className="text-muted-foreground flex items-center justify-between text-[11.5px]">
                <span>Pass mark</span>
                <span className="text-foreground font-mono">60%</span>
              </div>
              <div className="text-muted-foreground flex items-center justify-between text-[11.5px]">
                <span>Attempts</span>
                <span className="text-foreground font-mono">1 of 2 used</span>
              </div>
              <Link
                href="/student/quizzes"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
              >
                <ListChecks />
                Browse the catalogue
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {CAPABILITIES.map((item) => (
          <div key={item.title} className="border-border/70 bg-background/40 rounded-xl border p-4">
            <item.icon className="text-primary size-4" />
            <h3 className="mt-2.5 text-[13px] font-medium">{item.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-[12px] leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
