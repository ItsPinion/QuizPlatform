import { ArrowRight, Check, Play } from 'lucide-react';
import Link from 'next/link';

import { LiveStatus } from '@/components/landing/live-status';
import { BrowserFrame } from '@/components/landing/browser-frame';
import { AttemptShot, ResultShot } from '@/components/landing/product-shots';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PROOF = ['Server-side grading', 'Resumes on refresh', 'No answer key in the browser'];

/**
 * The first screen.
 *
 * One promise, two buttons, and a picture of the product that is the product —
 * the attempt screen is real markup, the live pill beside it asks the API how it
 * is doing. Nothing above the fold claims anything the app cannot do.
 */
export function Hero() {
  return (
    <section className="border-border/60 relative overflow-hidden border-b">
      <div className="bg-glow pointer-events-none absolute inset-0" />
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div>
          <Badge className="border-primary/30 bg-primary/10 text-primary gap-2 py-1 font-mono text-[10.5px] tracking-wide uppercase">
            <span className="bg-primary size-1.5 rounded-full" />
            v0.1.0 · live demo
          </Badge>

          <h1 className="mt-5 text-[2.6rem] leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl">
            Assessment that
            <br />
            <span className="from-primary bg-gradient-to-r via-violet-400 to-sky-400 bg-clip-text text-transparent">
              grades itself.
            </span>
          </h1>

          <p className="text-muted-foreground mt-5 max-w-md text-[15px] leading-relaxed">
            Write the quiz, publish it, and let students sit it under a clock the server owns. Every
            answer is marked on the server, every result is stored, and nothing on this page can be
            talked into a better score.
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
            <LiveStatus />
            <span className="text-muted-foreground/80 font-mono text-[10.5px]">
              demo · admin@quiz.dev / Admin12345
            </span>
          </div>
        </div>

        {/* The product, at an angle only a screenshot gets away with. */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <BrowserFrame path="quiz.example.com/student/attempt/8c1f">
            <AttemptShot />
          </BrowserFrame>

          <div className="border-border/80 bg-card/85 absolute -bottom-8 -left-4 hidden w-56 rounded-lg border p-2.5 shadow-[0_30px_80px_-40px_var(--primary)] backdrop-blur-md lg:block">
            <ResultShot />
          </div>
        </div>
      </div>
    </section>
  );
}
