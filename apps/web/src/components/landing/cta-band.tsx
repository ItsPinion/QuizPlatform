import type { LandingPayload } from '@quiz/shared/landing';
import { ArrowUpRight, KeyRound, Terminal } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The close.
 *
 * The credentials are not typed into this file: they come from the API's `demo`
 * block, which lists the seeded accounts *that actually exist in the database
 * right now*. `DEMO_ACCOUNTS=0` on a real deployment and this block disappears
 * instead of advertising a login to a database of real people.
 */
export function CtaBand({ payload }: { payload: LandingPayload | null }) {
  const demo = payload?.demo;
  const counts = payload?.counts;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
      <div className="border-border/70 bg-card/40 relative overflow-hidden rounded-2xl border px-6 py-10 sm:px-10">
        <div className="bg-glow pointer-events-none absolute inset-0 opacity-70" />
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-20" />

        <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Try it on live data.
            </h2>
            <p className="text-muted-foreground mt-3 max-w-md text-[13.5px] leading-relaxed">
              {counts ? (
                <>
                  {counts.categories} categories, {counts.publishedQuizzes} published quizzes,{' '}
                  {counts.users} accounts and {counts.gradedAttempts} graded papers — enough for the
                  dashboards and the leaderboard to say something true on the first load.
                </>
              ) : (
                'The database backs every number on this page. Sign in to see it from the inside.'
              )}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/login" className={cn(buttonVariants({ size: 'lg' }), 'group')}>
                Sign in
                <ArrowUpRight className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <Link
                href="/register"
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
              >
                <KeyRound className="size-3.5" />
                Create a student account
              </Link>
            </div>
          </div>

          <div className="space-y-2">
            {demo?.accounts.length ? (
              <>
                {demo.accounts.map((account) => (
                  <div
                    key={account.email}
                    className="border-border/60 bg-background/60 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 font-mono text-[11px]"
                  >
                    <span className="text-muted-foreground w-[3.6rem] shrink-0 text-[9.5px] tracking-wide uppercase">
                      {account.role}
                    </span>
                    <span>{account.email}</span>
                    <span className="text-muted-foreground/60">/</span>
                    <span className="text-muted-foreground">{account.password}</span>
                  </div>
                ))}
                <p className="text-muted-foreground/80 flex items-center gap-1.5 px-1 pt-1 text-[10.5px]">
                  <Terminal className="size-3" />
                  Seeded demo accounts, verified against the users table.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground border-border/60 bg-background/40 rounded-lg border px-3 py-3 text-[11.5px] leading-relaxed">
                {demo?.enabled === false
                  ? 'Demo credentials are not published on this deployment (DEMO_ACCOUNTS=0).'
                  : 'No demo accounts in this database — run bun run db:seed to load them.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
