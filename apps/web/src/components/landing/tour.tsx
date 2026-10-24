import type { LandingPayload } from '@quiz/shared/landing';
import {
  durationLabel,
  durationRangeLabel,
  passingRangeLabel,
  percentLabel,
  questionRangeLabel,
} from '@quiz/shared/landing';

import { BrowserFrame } from '@/components/landing/browser-frame';
import { CatalogueShot, ConsoleShot, ResultShot } from '@/components/landing/product-shots';
import { cn } from '@/lib/utils';

/**
 * Three screens, in the order they happen.
 *
 * The headings are copy; every number under them is read from the payload — the
 * catalogue length, the pass marks, the graded counts — so the tour describes the
 * deployment it is running on rather than the one it was written for.
 */

interface Stop {
  step: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  shot: React.ReactNode;
  path: string;
  tone: 'primary' | 'sky' | 'success';
}

function stops(payload: LandingPayload | null): Stop[] {
  const counts = payload?.counts;
  const shape = payload?.shape;
  const result = payload?.sampleResult;

  return [
    {
      step: '01',
      eyebrow: 'For students',
      title: 'Every quiz, with its state attached',
      body: 'Only published quizzes are listed, and each one arrives with its category, level, duration and question count. Categories come from the table, so a new one appears here without a deploy.',
      points: [
        counts
          ? `${counts.publishedQuizzes} published quizzes across ${counts.categories} categories`
          : 'Published quizzes only — drafts never reach a student',
        shape
          ? `${durationRangeLabel(shape)} per paper, ${questionRangeLabel(shape)} questions`
          : 'Each paper carries its own duration',
        'Attempt limits are enforced by the API, never by hiding a button',
      ],
      shot: <CatalogueShot payload={payload} />,
      path: '…/student/quizzes',
      tone: 'primary',
    },
    {
      step: '02',
      eyebrow: 'Grading',
      title: 'One grader, one verdict, no second opinion',
      body: 'Marks, counts, percentage and pass/fail come from a single pure function on the server. Submitting twice returns the stored result instead of grading the paper again.',
      points: [
        result
          ? `This paper: ${result.marks}/${result.totalMarks} marks, ${durationLabel(result.timeTakenSeconds)} on the clock`
          : 'Marks sum from the questions, never from the client',
        shape
          ? `Pass marks run ${passingRangeLabel(shape)} across the catalogue`
          : 'Pass mark per quiz',
        'The answer key is released only after the attempt is finished',
      ],
      shot: <ResultShot payload={payload} />,
      path: '…/student/results',
      tone: 'success',
    },
    {
      step: '03',
      eyebrow: 'For administrators',
      title: 'A console that reads the database',
      body: 'Statistics, the user directory, quiz and category management, analytics and the deployment report — each one a query, none of them a cached number in the browser.',
      points: [
        counts
          ? `${counts.users} accounts · ${counts.attempts} attempts · ${percentLabel(counts.averagePercentage)} average`
          : 'Live aggregates, one query per section',
        'Publish only when a quiz has questions; delete only when it has history',
        'Role and status changes are audited by the rules, including self-lockout',
      ],
      shot: <ConsoleShot payload={payload} />,
      path: '…/admin',
      tone: 'sky',
    },
  ];
}

export function Tour({ payload }: { payload: LandingPayload | null }) {
  return (
    <div className="space-y-16 lg:space-y-24">
      {stops(payload).map((stop, index) => {
        const flipped = index % 2 === 1;

        return (
          <div key={stop.step} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
            <div className={cn(flipped && 'lg:order-2')}>
              <div className="flex items-center gap-2.5">
                <span className="text-primary/70 font-mono text-[11px]">{stop.step}</span>
                <span className="bg-border h-px w-5" />
                <span className="text-muted-foreground font-mono text-[10.5px] tracking-[0.18em] uppercase">
                  {stop.eyebrow}
                </span>
              </div>

              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem]">
                {stop.title}
              </h3>
              <p className="text-muted-foreground mt-3 max-w-md text-[13.5px] leading-relaxed">
                {stop.body}
              </p>

              <ul className="mt-5 space-y-2">
                {stop.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-[12.5px]">
                    <span className="border-border/70 bg-background/60 text-muted-foreground mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border font-mono text-[8.5px]">
                      ✓
                    </span>
                    <span className="text-muted-foreground leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={cn('mx-auto w-full max-w-md', flipped && 'lg:order-1')}>
              <BrowserFrame path={stop.path} tone={stop.tone}>
                {stop.shot}
              </BrowserFrame>
            </div>
          </div>
        );
      })}
    </div>
  );
}
