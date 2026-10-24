import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/forgot-password-form';
import { fetchLanding } from '@/lib/landing';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reset your password — QuizPlatform',
  description: 'Ask for a single-use link to set a new password on your QuizPlatform account.',
};

/**
 * Forgot password.
 *
 * Public on purpose: the whole point is that the visitor cannot sign in. Signed-in
 * visitors can still reach it — changing a forgotten password from a borrowed
 * device is a real thing — and the header already offers their own area.
 */
export default async function ForgotPasswordPage() {
  const [payload, session] = await Promise.all([fetchLanding(), getSession()]);

  return (
    <AuthShell payload={payload} kind="forgot" user={session?.user ?? null}>
      <div className="cine-glass card-sheen relative overflow-hidden rounded-3xl p-6 shadow-[0_50px_140px_-60px_rgba(0,0,0,0.9)] sm:p-9">
        <h1
          id="forgot-heading"
          className="font-display text-[clamp(2.3rem,5vw,3.15rem)] leading-[0.95] font-extralight tracking-tight"
        >
          Reset your password
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed font-light text-gray-400">
          Enter the address on your account and we will send a link that sets a new password. The
          link is single-use and expires in an hour.
        </p>

        <div className="mt-7">
          <ForgotPasswordForm />
        </div>

        <p className="border-border/60 text-muted-foreground mt-7 border-t pt-5 text-[13.5px]">
          <Link
            href="/login"
            className="text-foreground focus-visible:ring-ring/60 inline-flex items-center gap-1 font-medium underline underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
