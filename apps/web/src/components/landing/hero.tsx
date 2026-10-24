import type { LandingPayload } from '@quiz/shared/landing';
import { ArrowRight, Check, Play } from 'lucide-react';
import Link from 'next/link';

import { BrowserFrame } from '@/components/landing/browser-frame';
import { LibraryScene } from '@/components/landing/library-scene';
import { LiveStatus } from '@/components/landing/live-status';
import { AttemptShot, ResultShot } from '@/components/landing/product-shots';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { heroActions } from '@/lib/hero-params';
import { cn } from '@/lib/utils';

/**
 * The first screen.
 *
 * The promise is fixed copy; everything printed around it — the version, the
 * counts in the pill, the question, the marks, the graded paper behind it —
 * arrived from `/api/landing` on this request.
 *
 * The two buttons depend on who is looking (`heroActions`): a visitor gets
 * "Get started", a student gets "Take a quiz" pointed at the catalogue, an
 * administrator gets "Open the console". Nothing here asks a signed-in person
 * to sign in again.
 *
 * The pixel bookshelf is the reading room the copy is talking about; the laptop
 * sits on it.
 */

const PROOF = ['Server-side grading', 'Resumes on refresh', 'No answer key in the browser'];

export function Hero({ payload, role }: { payload: LandingPayload | null; role: string | null }) {
  const question = payload?.sampleQuestion;
  const counts = payload?.counts;
  const actions = heroActions(role);
  const signedIn = role === 'STUDENT' || role === 'ADMIN';

  // Never print a version we do not have. `v0.0.0` is not a version, it is a
  // placeholder wearing one, and the badge is the first thing on the page.
  const badge = payload
    ? `v${payload.service.version} · ${signedIn ? 'you are signed in' : 'live demo'}`
    : signedIn
      ? 'you are signed in'
      : 'demo';

  return (
    <section className="border-border/60 relative overflow-hidden border-b">
      <div className="bg-glow pointer-events-none absolute inset-0" />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-28 pb-8 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:pt-32 lg:pb-10">
        <div>
          <div className="reveal" style={{ '--reveal-delay': '60ms' } as React.CSSProperties}>
            <Badge className="border-primary/30 bg-primary/10 text-primary gap-2 py-1 font-mono text-[10.5px] tracking-wide uppercase">
              <span className="bg-primary animate-pulse-dot size-1.5 rounded-full motion-reduce:animate-none" />
              {badge}
            </Badge>
          </div>

          <h1
            className="reveal mt-5 text-[2.6rem] leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl"
            style={{ '--reveal-delay': '140ms' } as React.CSSProperties}
          >
            Assessment that
            <br />
            <span className="text-glow from-primary bg-gradient-to-r via-violet-400 to-sky-400 bg-clip-text text-transparent">
              grades itself.
            </span>
          </h1>

          <p
            className="reveal text-muted-foreground mt-5 max-w-md text-[15px] leading-relaxed"
            style={{ '--reveal-delay': '220ms' } as React.CSSProperties}
          >
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

          <div
            className="reveal mt-7 flex flex-wrap items-center gap-3"
            style={{ '--reveal-delay': '300ms' } as React.CSSProperties}
          >
            <Link
              href={actions.primary.href}
              className={cn(
                buttonVariants({ size: 'lg' }),
                'shine group h-12 rounded-xl px-6 text-[15px]',
              )}
            >
              {actions.primary.label}
              <ArrowRight
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href={actions.secondary.href}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'border-border/80 hover:border-primary/40 h-12 rounded-xl px-5 text-[15px]',
              )}
            >
              {actions.secondary.href.startsWith('#') ? (
                <Play aria-hidden className="size-3.5" />
              ) : null}
              {actions.secondary.label}
            </Link>
          </div>

          <ul
            className="reveal text-muted-foreground mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px]"
            style={{ '--reveal-delay': '360ms' } as React.CSSProperties}
          >
            {PROOF.map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <Check className="text-success size-3" />
                {item}
              </li>
            ))}
          </ul>

          <div
            className="reveal mt-6 flex flex-wrap items-center gap-2"
            style={{ '--reveal-delay': '420ms' } as React.CSSProperties}
          >
            <LiveStatus payload={payload} />
            {question ? (
              <span className="text-muted-foreground/80 truncate font-mono text-[10.5px]">
                now showing · {question.quizTitle}
              </span>
            ) : null}
          </div>
        </div>

        {/* The product, on a shelf, in a library. */}
        <div className="reveal-scale relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="float-slower relative">
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

          <LibraryScene className="mt-8 max-w-[24rem] opacity-95 drop-shadow-[0_30px_60px_rgba(0,0,0,0.55)]" />
        </div>
      </div>
    </section>
  );
}
