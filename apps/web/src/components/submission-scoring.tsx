import {
  BadgeCheck,
  Calculator,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  ListChecks,
  ServerCog,
  Timer,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const STATS = [
  { label: 'Correct', value: '16', icon: CircleCheck, tone: 'success' },
  { label: 'Incorrect', value: '3', icon: CircleX, tone: 'destructive' },
  { label: 'Unanswered', value: '1', icon: ListChecks, tone: 'muted' },
  { label: 'Time taken', value: '14:21', icon: Timer, tone: 'muted' },
] as const;

const CAPABILITIES = [
  {
    icon: Calculator,
    title: 'One grader, two ways in',
    body: 'gradeAttempt() is a pure function of the questions, the answer key and the saved answers. The Submit button and the countdown call the same endpoint, so a click and a closed tab cannot disagree.',
  },
  {
    icon: ServerCog,
    title: 'Expiry is lazy, so nothing is lost',
    body: 'There is no cron. Every student read settles attempts whose deadline has passed, and a client that reconnects late is graded at its deadline — completedAt is clamped to expiresAt.',
  },
  {
    icon: BadgeCheck,
    title: 'The row is the receipt',
    body: 'Score, total marks, correct/incorrect/unanswered counts, percentage, pass/fail and time taken are written to the attempt; is_correct is stamped per answer for the review screen.',
  },
];

/** Landing-page preview of Day 8; the live screen is the end of an attempt. */
export function SubmissionScoring() {
  return (
    <div className="space-y-4">
      <Card className="border-success/30 overflow-hidden">
        <div className="border-border/70 bg-muted/20 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <span className="bg-success/15 text-success inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10.5px]">
            <Check className="size-3" /> PASSED
          </span>
          <span className="text-muted-foreground font-mono text-[11px]">
            POST /api/student/attempts/:id/submit
          </span>
          <Badge variant="outline" className="ml-auto font-mono text-[10.5px]">
            200 · alreadySubmitted: false
          </Badge>
        </div>

        <CardContent className="space-y-4 py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-muted-foreground text-[10.5px] tracking-wider uppercase">
                JavaScript Fundamentals
              </p>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-success text-4xl leading-none font-semibold tracking-tight tabular-nums">
                  80%
                </span>
                <span className="text-muted-foreground pb-0.5 text-[12px]">
                  8 of 10 marks · pass mark 60%
                </span>
              </div>
            </div>
            <div className="text-right">
              <Badge variant="success" className="gap-1.5">
                <BadgeCheck className="size-3" />
                You passed
              </Badge>
              <p className="text-muted-foreground mt-1.5 font-mono text-[10.5px]">
                graded in 18 ms · server clock
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="border-border/70 bg-background/40 flex items-center gap-2 rounded-lg border px-2.5 py-2"
              >
                <stat.icon
                  className={cn(
                    'size-3.5 shrink-0',
                    stat.tone === 'success' && 'text-success',
                    stat.tone === 'destructive' && 'text-destructive',
                    stat.tone === 'muted' && 'text-muted-foreground',
                  )}
                />
                <div>
                  <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
                    {stat.label}
                  </p>
                  <p className="text-[13px] font-medium tabular-nums">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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

      <p className="text-muted-foreground flex items-center gap-1.5 text-[11.5px]">
        <Clock className="size-3.5" />
        Time&apos;s up? The attempt submits itself, and the result says so — a late retry returns
        the stored row instead of grading the paper twice.
      </p>
    </div>
  );
}
