import { ArrowUpRight, KeyRound, Terminal } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ACCOUNTS = [
  { role: 'Admin', email: 'admin@quiz.dev', password: 'Admin12345' },
  { role: 'Student', email: 'rahul@quiz.dev', password: 'Password123' },
];

/**
 * The close.
 *
 * No newsletter, no "book a call" — the product is seeded and running, so the
 * call to action is the demo login. The credentials are printed because they are
 * already in the README, and pretending there is a signup wall would be worse.
 */
export function CtaBand() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
      <div className="border-border/70 bg-card/40 relative overflow-hidden rounded-2xl border px-6 py-10 sm:px-10">
        <div className="bg-glow pointer-events-none absolute inset-0 opacity-70" />
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-20" />

        <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Try it on seeded data.
            </h2>
            <p className="text-muted-foreground mt-3 max-w-md text-[13.5px] leading-relaxed">
              Ten quizzes across ten categories, four accounts, and a fortnight of attempt history —
              enough for the dashboards and the leaderboard to say something true on the first load.
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
            {ACCOUNTS.map((account) => (
              <div
                key={account.role}
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
              Seeded demo accounts — reset the database any time with{' '}
              <span className="font-mono">bun run db:seed -- --force</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
