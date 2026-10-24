import { headlineNumbers } from '@quiz/shared/landing';

import { CinemaHero } from '@/components/cinema/hero';
import { Film } from '@/components/cinema/film';
import { CtaBand } from '@/components/landing/cta-band';
import { PlatformBento } from '@/components/landing/platform-bento';
import { SectionHeading } from '@/components/landing/section-heading';
import { Tour } from '@/components/landing/tour';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SkipLink } from '@/components/skip-link';
import { getSession } from '@/lib/session';
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
    <div className="relative flex min-h-dvh flex-col bg-black">
      <SkipLink />

      <SiteHeader version={payload?.service.version} user={session?.user ?? null} />

      {/*
        The first screen: a 100dvh frame with the film behind it. The hero owns
        its own background (the video is inside it, not behind the whole
        document) so everything below the fold is solid black — one long video
        would cost battery for a section nobody is looking at.
      */}
      <main id="main" tabIndex={-1} className="relative flex-1 outline-none">
        <div className="relative isolate">
          <Film />
          <CinemaHero payload={payload} user={session?.user ?? null} />
        </div>

        {unavailable ? (
          <div
            role="status"
            className="border-b border-white/15 bg-white/8 px-5 py-3 text-center text-[11.5px] tracking-[0.08em] text-white/80 uppercase sm:px-8"
          >
            Live data is unavailable right now — {unavailable}. The page is showing its empty states
            rather than guessed numbers.
          </div>
        ) : null}

        {/* ------------------------------- numbers ------------------------------ */}
        {numbers.length > 0 ? (
          <section className="border-b border-white/8">
            <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-y-10 px-6 py-14 sm:px-8 lg:grid-cols-4">
              {numbers.map((item, index) => (
                <div
                  key={item.label}
                  style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties}
                  className={cn(
                    'reveal',
                    'border-l border-white/10 pl-6 lg:pl-8',
                    index === 0 && 'border-l-0 pl-0 lg:pl-0',
                    index === 2 && 'border-l-0 pl-0 lg:border-l lg:pl-8',
                  )}
                >
                  <div className="font-display text-4xl font-light tracking-tight text-white tabular-nums">
                    {item.value}
                  </div>
                  <div className="cine-label mt-3 text-[10px] text-gray-300">{item.label}</div>
                  <div className="mt-1 text-[11px] font-light text-gray-500">
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
          className="mx-auto w-full max-w-6xl scroll-mt-32 px-6 py-20 sm:px-8 lg:py-28"
        >
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              eyebrow="The platform"
              title="Everything the exam needs, in one place"
              description="Six surfaces, one session and one typed contract behind them. Hover a card: the light follows your cursor, and every number on it was a SQL count a moment ago."
            />
            <p className="max-w-[16rem] text-[11px] leading-relaxed font-light text-gray-500">
              Spotlight, lit border, drifting stars and a few degrees of tilt. Nothing moves on
              touch, or if your system asks for reduced motion.
            </p>
          </div>

          <div className="mt-8">
            <PlatformBento payload={payload} />
          </div>
        </section>

        {/* -------------------------------- tour ------------------------------- */}
        <section id="tour" className="scroll-mt-32 border-y border-white/8 bg-white/[0.015]">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:px-8 lg:py-28">
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
