import { CtaBand } from '@/components/landing/cta-band';
import { Hero } from '@/components/landing/hero';
import { Tour } from '@/components/landing/tour';
import { PlatformBento } from '@/components/landing/platform-bento';
import { SectionHeading } from '@/components/landing/section-heading';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { cn } from '@/lib/utils';

/**
 * The landing page.
 *
 * Six blocks, in the order a visitor asks the questions:
 *
 *   1. hero        — what is it, and can I see it?          (one promise, one picture)
 *   2. numbers     — is there anything behind it?           (four true counts)
 *   3. platform    — what does it actually contain?         (the bento map)
 *   4. tour        — what does using it feel like?          (three screens, in order)
 *   5. call        — can I try it?                          (demo login)
 *   6. footer      — where is the documentation?            (links, not copies)
 *
 * Everything that belongs in a manual — the schema, the endpoint table, the
 * thirteen-day log, the deployment matrix, the file tree — lives in the README
 * and `docs/`, and the footer points at it. A landing page that repeats the
 * README is a README with worse typography.
 */

const NUMBERS = [
  { value: '10', label: 'categories', note: 'every one a row, not an enum' },
  { value: '47', label: 'questions', note: 'multiple choice, one key' },
  { value: '8', label: 'published quizzes', note: 'two still in draft' },
  { value: '844', label: 'automated tests', note: 'plus a 75-check smoke run' },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <Hero />

        {/* ------------------------------- numbers ------------------------------ */}
        <section className="border-border/60 border-b">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-y-8 px-5 py-10 sm:px-8 lg:grid-cols-4">
            {NUMBERS.map((item, index) => (
              <div
                key={item.label}
                className={cn(
                  'border-border/50 border-l pl-5 lg:pl-8',
                  index === 0 && 'border-l-0 pl-0 lg:pl-0',
                  index === 2 && 'border-l-0 pl-0 lg:border-l lg:pl-8',
                )}
              >
                <div className="text-3xl font-semibold tracking-tight tabular-nums">
                  {item.value}
                </div>
                <div className="text-[12.5px] font-medium">{item.label}</div>
                <div className="text-muted-foreground/80 mt-0.5 text-[10.5px]">{item.note}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------ platform ----------------------------- */}
        <section id="platform" className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              eyebrow="The platform"
              title="Everything the exam needs, in one place"
              description="Student, grader, console, security and deployment — one session and one typed contract behind them. Hover a card: the light follows your cursor, and every number on it is a query, not a promise."
            />
            <p className="text-muted-foreground/80 max-w-[15rem] text-[11px] leading-relaxed">
              Spotlight, lit border, drifting stars and a few degrees of tilt. Nothing moves on
              touch, or if your system asks for reduced motion.
            </p>
          </div>

          <div className="mt-8">
            <PlatformBento />
          </div>
        </section>

        {/* -------------------------------- tour ------------------------------- */}
        <section id="tour" className="border-border/60 bg-card/20 border-y">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
            <SectionHeading
              eyebrow="The tour"
              title="Three screens, start to finish"
              description="The same paper, seen by the student who sits it, the grader that marks it and the administrator who published it."
            />

            <div className="mt-12">
              <Tour />
            </div>
          </div>
        </section>

        {/* --------------------------------- cta ------------------------------- */}
        <CtaBand />
      </main>

      <SiteFooter />
    </div>
  );
}
