import type { LandingPayload } from '@quiz/shared/landing';
import { ArrowRight, Check, Play } from 'lucide-react';
import Link from 'next/link';

import { BrowserFrame } from '@/components/landing/browser-frame';
import { LiveStatus } from '@/components/landing/live-status';
import { AttemptShot, ResultShot } from '@/components/landing/product-shots';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The first screen.
 *
 * The promise is fixed copy; everything printed around it — the version, the
 * counts in the pill, the question, the marks, the graded paper behind it —
 * arrived from `/api/landing` on this request. When the API is unreachable the
 * frame says so instead of rendering placeholders that look like content.
 */

const PROOF = ['Server-side grading', 'Resumes on refresh', 'No answer key in the browser'];

export function Hero({ payload }: { payload: LandingPayload | null }) {
  const question = payload?.sampleQuestion;
  const counts = payload?.counts;

  return (
    <section className="border-border/60 relative overflow-hidden border-b">
      <div className="bg-glow pointer-events-none absolute inset-0" />
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div>
          <Badge className="border-primary/30 bg-primary/10 text-primary gap-2 py-1 font-mono text-[10.5px] tracking-wide uppercase">
            <span className="bg-primary size-1.5 rounded-full" />v
            {payload?.service.version ?? '0.0.0'} · live demo
          </Badge>

          <h1 className="mt-5 text-[2.6rem] leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl">
            Assessment that
            <br />
            <span className="from-primary bg-gradient-to-r via-violet-400 to-sky-400 bg-clip-text text-transparent">
              grades itself.
            </span>
          </h1>

          <p className="text-muted-foreground mt-5 max-w-md text-[15px] leading-relaxed">
            {counts && counts.publishedQuizzes > 0 ? (
              <>
                {counts.publishedQuizzes} published quizzes, {counts.questions} questions and{' '}
                {counts.gradedAttempts} papers graded so far. Students sit them under a clock the
                server owns, and every answer is marked on the server — nothing on this page can be
                talked into a better score.
              </>
            ) : (
              <>
                Write the quiz, publish it, and let students sit it under a clock the server owns.
                Every answer is marked on the server and every result is stored — nothing here can
                be talked into a better score.
              </>
            )}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/login" className={cn(buttonVariants({ size: 'lg' }), 'group')}>
              Take the demo quiz
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="#tour"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'group')}
            >
              <Play className="size-3.5" />
              See it working
            </Link>
          </div>

          <ul className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px]">
            {PROOF.map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <Check className="text-success size-3" />
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <LiveStatus payload={payload} />
            {question ? (
              <span className="text-muted-foreground/80 truncate font-mono text-[10.5px]">
                now showing · {question.quizTitle}
              </span>
            ) : null}
          </div>
        </div>

        {/* The product, at an angle only a screenshot gets away with. */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <BrowserFrame
            path={question ? `…/student/attempt · ${question.category}` : '…/student/attempt'}
          >
            <AttemptShot payload={payload} />
          </BrowserFrame>

          {payload?.sampleResult ? (
            <div className="border-border/80 bg-card/85 absolute -bottom-8 -left-4 hidden w-56 rounded-lg border p-2.5 shadow-[0_30px_80px_-40px_var(--primary)] backdrop-blur-md lg:block">
              <ResultShot payload={payload} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
