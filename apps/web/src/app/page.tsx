import { headlineNumbers } from '@quiz/shared/landing';

import { getSession } from '@/lib/session';
import { Atmosphere } from '@/components/landing/atmosphere';
import { CtaBand } from '@/components/landing/cta-band';
import { Hero } from '@/components/landing/hero';
import { PlatformBento } from '@/components/landing/platform-bento';
import { SectionHeading } from '@/components/landing/section-heading';
import { Tour } from '@/components/landing/tour';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SkipLink } from '@/components/skip-link';
import { cn } from '@/lib/utils';
import { fetchLanding } from '@/lib/landing';

/**
 * The landing page.
 *
 * Six blocks, in the order a visitor asks the questions:
 *
 *   1. hero        — what is it, and can I see it?
 *   2. numbers     — how much is actually in here?
 *   3. platform    — what does it contain?
 *   4. tour        — what does using it feel like?
 *   5. call        — can I try it?
 *   6. footer      — where is the documentation?
 *
 * Every figure on the page — counts, ranges, the sample question, the graded
 * paper, the demo logins — arrives in one `GET /api/landing` response, validated
 * against a Zod schema before it is rendered. There is no constant in this file
 * that a database row should own; the copy is copy, the numbers are data.
 *
 * Nothing here is cached: a landing page that says "live" has to mean it.
 */

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [payload, session] = await Promise.all([fetchLanding(), getSession()]);
  const role = session?.user.role ?? null;
  const numbers = payload ? headlineNumbers(payload) : [];

  /**
   * Why there is nothing to show, in the page's own words.
   *
   * Two different failures arrive here as two different shapes: an API that
   * answers but cannot read the database sends `unavailableReason`, while an API
   * that does not answer at all leaves `fetchLanding` with nothing. Both used to
   * look the same — empty cards and no explanation — which reads like a broken
   * page rather than a broken service.
   */
  const unavailable = payload ? payload.unavailableReason : 'the API did not answer';
  const notes: Record<string, string> = payload
    ? {
        categories: 'every one a row, not an enum',
        questions: 'multiple choice, one key',
        'published quizzes': `${payload.counts.quizzes} in total, drafts included`,
        'papers graded': `${payload.counts.attempts} attempts started`,
      }
    : {};

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader version={payload?.service.version} />

      <SkipLink />

      <main id="main" className="relative flex-1 overflow-hidden">
        <Atmosphere />

        {unavailable ? (
          <div
            role="status"
            className="border-destructive/30 bg-destructive/10 text-destructive border-b px-5 py-2 text-center text-[11.5px] sm:px-8"
          >
            Live data is unavailable right now — {unavailable}. The page is showing its empty states
            rather than guessed numbers.
          </div>
        ) : null}

        <Hero payload={payload} role={role} />

        {/* ------------------------------- numbers ------------------------------ */}
        {numbers.length > 0 ? (
          <section className="border-border/60 border-b">
            <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-y-8 px-5 py-10 sm:px-8 lg:grid-cols-4">
              {numbers.map((item, index) => (
                <div
                  key={item.label}
                  style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties}
                  className={cn(
                    'reveal',
                    'border-border/50 border-l pl-5 lg:pl-8',
                    index === 0 && 'border-l-0 pl-0 lg:pl-0',
                    index === 2 && 'border-l-0 pl-0 lg:border-l lg:pl-8',
                  )}
                >
                  <div className="text-3xl font-semibold tracking-tight tabular-nums">
                    {item.value}
                  </div>
                  <div className="text-[12.5px] font-medium">{item.label}</div>
                  <div className="text-muted-foreground/80 mt-0.5 text-[10.5px]">
                    {notes[item.label] ?? ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ------------------------------ platform ----------------------------- */}
        <section
          id="platform"
          className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-16 sm:px-8 lg:py-20"
        >
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              eyebrow="The platform"
              title="Everything the exam needs, in one place"
              description="Six surfaces, one session and one typed contract behind them. Hover a card: the light follows your cursor, and every number on it was a SQL count a moment ago."
            />
            <p className="text-muted-foreground/80 max-w-[15rem] text-[11px] leading-relaxed">
              Spotlight, lit border, drifting stars and a few degrees of tilt. Nothing moves on
              touch, or if your system asks for reduced motion.
            </p>
          </div>

          <div className="mt-8">
            <PlatformBento payload={payload} />
          </div>
        </section>

        {/* -------------------------------- tour ------------------------------- */}
        <section id="tour" className="border-border/60 bg-card/20 scroll-mt-16 border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <SectionHeading
              eyebrow="The tour"
              title="Three screens, start to finish"
              description="The same paper, seen by the student who sits it, the grader that marks it and the administrator who published it."
            />

            <div className="mt-12">
              <Tour payload={payload} />
            </div>
          </div>
        </section>

        {/* --------------------------------- cta ------------------------------- */}
        <CtaBand payload={payload} />
      </main>

      <SiteFooter payload={payload} />
    </div>
  );
}
