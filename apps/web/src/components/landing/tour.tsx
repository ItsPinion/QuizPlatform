import { BrowserFrame } from '@/components/landing/browser-frame';
import { CatalogueShot, ConsoleShot, ResultShot } from '@/components/landing/product-shots';
import { cn } from '@/lib/utils';

/**
 * Three screens, in the order they happen.
 *
 * A tour, not a feature list: sit the quiz → read the result → run the console.
 * Each row is one claim with one picture, alternating sides so the eye moves down
 * the page instead of scanning a grid of equal boxes.
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

const STOPS: Stop[] = [
  {
    step: '01',
    eyebrow: 'For students',
    title: 'Every quiz, with its state attached',
    body: 'Only published quizzes are listed, and each one arrives with its category, level and duration plus your own attempt state — in progress, attempts left, best score. Categories come from the table, not a hardcoded list.',
    points: [
      'Start, resume or read a result straight from the catalogue',
      'Attempt limits are enforced by the API, never by hiding a button',
      'A new category created in the console appears here on the next load',
    ],
    shot: <CatalogueShot />,
    path: 'quiz.example.com/student/quizzes',
    tone: 'primary',
  },
  {
    step: '02',
    eyebrow: 'Grading',
    title: 'One grader, one answer, no second opinion',
    body: 'Marks, counts, percentage and pass/fail come from a single pure function on the server. Submitting twice returns the stored result instead of grading the paper again.',
    points: [
      'Submitted by hand or settled at the deadline — the same code path',
      'The answer key is released only after the attempt is finished',
      'Per-question verdicts sum exactly to the stored total',
    ],
    shot: <ResultShot />,
    path: 'quiz.example.com/student/results',
    tone: 'success',
  },
  {
    step: '03',
    eyebrow: 'For administrators',
    title: 'A console that reads the database',
    body: 'Statistics, the user directory, quiz and category management, analytics and the deployment report — each one a query, none of them a cached number in the browser.',
    points: [
      'Publish only when a quiz has questions; delete only when it has history',
      'Categories are rows, created from the same input that filters them',
      'Role and status changes are audited by the rules, including self-lockout',
    ],
    shot: <ConsoleShot />,
    path: 'quiz.example.com/admin',
    tone: 'sky',
  },
];

export function Tour() {
  return (
    <div className="space-y-16 lg:space-y-24">
      {STOPS.map((stop, index) => {
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
