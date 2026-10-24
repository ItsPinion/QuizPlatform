import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/login-form';
import { fetchLanding } from '@/lib/landing';
import { getSession } from '@/lib/session';
import { safeNextPath } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in — QuizPlatform',
  description: 'Sign in to your QuizPlatform account to sit quizzes and read your results.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  // The demo accounts are the ones this deployment actually has — read from the
  // database, not typed into the page. `DEMO_ACCOUNTS=0` turns them off.
  const [payload, session] = await Promise.all([fetchLanding(), getSession()]);
  const demo = payload?.demo.enabled ? payload.demo.accounts : [];
  const continuing = next !== '/';

  return (
    <AuthShell payload={payload} kind="login" user={session?.user ?? null}>
      <div className="glow-frame border-border/70 bg-card/70 card-sheen relative rounded-2xl border p-6 shadow-[0_40px_120px_-70px] shadow-black sm:p-8">
        <h1
          id="sign-in-heading"
          className="text-[2.1rem] leading-[1.05] font-semibold tracking-tight sm:text-[2.6rem]"
        >
          Sign in
        </h1>
        <p className="text-muted-foreground mt-2.5 text-[15px] leading-relaxed">
          {continuing
            ? 'Sign in to carry on where you were headed.'
            : 'Your attempts, results and rank are waiting.'}
        </p>

        <div className="mt-7">
          <LoginForm next={next} demo={demo} />
        </div>

        <p className="border-border/60 text-muted-foreground mt-7 border-t pt-5 text-[13.5px]">
          New here?{' '}
          <Link
            href="/register"
            className="text-foreground focus-visible:ring-ring/60 inline-flex items-center gap-1 font-medium underline underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
          >
            Create an account
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </p>
      </div>

      <p className="text-muted-foreground/80 mt-4 px-1 text-[11.5px] leading-relaxed">
        {demo.length > 0
          ? 'The demo buttons fill the form with accounts that exist in this database. Nothing is submitted until you press Sign in.'
          : payload
            ? 'No demo accounts are published on this deployment. Use the account you registered with.'
            : 'Demo accounts are unavailable right now — the API did not answer. The form still works for an account you already have.'}
      </p>
    </AuthShell>
  );
}
