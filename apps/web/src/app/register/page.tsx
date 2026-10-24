import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { RegisterForm } from '@/components/register-form';
import { fetchLanding } from '@/lib/landing';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create an account — QuizPlatform',
  description: 'Create a student account and start sitting quizzes in under a minute.',
};

export default async function RegisterPage() {
  const [payload, session] = await Promise.all([fetchLanding(), getSession()]);
  const quizzes = payload?.counts.publishedQuizzes ?? 0;

  return (
    <AuthShell payload={payload} kind="register" user={session?.user ?? null}>
      <div className="glow-frame border-border/70 bg-card/70 card-sheen relative rounded-2xl border p-6 shadow-[0_40px_120px_-70px] shadow-black sm:p-8">
        <h1
          id="register-heading"
          className="text-[2.1rem] leading-[1.05] font-semibold tracking-tight sm:text-[2.6rem]"
        >
          Create your account
        </h1>
        <p className="text-muted-foreground mt-2.5 text-[15px] leading-relaxed">
          {quizzes > 0
            ? `Free, instant, and ${quizzes} quizzes are open right now.`
            : 'Free, instant, and no confirmation email.'}
        </p>

        <div className="mt-7">
          <RegisterForm />
        </div>

        <p className="border-border/60 text-muted-foreground mt-7 border-t pt-5 text-[13.5px]">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-foreground focus-visible:ring-ring/60 inline-flex items-center gap-1 font-medium underline underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
          >
            Sign in
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </p>
      </div>

      <p className="text-muted-foreground/80 mt-4 px-1 text-[11.5px] leading-relaxed">
        Student accounts can sit quizzes and read their own results. Administrator access is granted
        from the admin console, never from this form.
      </p>
    </AuthShell>
  );
}
