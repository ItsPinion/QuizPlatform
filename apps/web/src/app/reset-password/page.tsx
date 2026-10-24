import { ArrowLeft, LinkIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { ResetPasswordForm } from '@/components/reset-password-form';
import { buttonVariants } from '@/components/ui/button';
import { fetchLanding } from '@/lib/landing';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Choose a new password — QuizPlatform',
  description: 'Set a new password with the single-use link from your email.',
  // A reset URL has no business in a search index.
  robots: { index: false, follow: false },
};

/**
 * The page the mail links to.
 *
 * The token arrives in the query string (a link in an email cannot POST), is read
 * here and handed to the form. With no token the page says so instead of
 * rendering a form that could only fail — a dead link is a normal thing to hit,
 * since tokens expire after an hour and work once.
 */

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = (raw ?? '').trim();

  const [payload, session] = await Promise.all([fetchLanding(), getSession()]);

  return (
    <AuthShell payload={payload} kind="reset" user={session?.user ?? null}>
      <div className="cine-glass card-sheen relative overflow-hidden rounded-3xl p-6 shadow-[0_50px_140px_-60px_rgba(0,0,0,0.9)] sm:p-9">
        <h1
          id="reset-heading"
          className="font-display text-[clamp(2.3rem,5vw,3.15rem)] leading-[0.95] font-extralight tracking-tight"
        >
          Choose a new password
        </h1>

        {token === '' ? (
          <>
            <p className="mt-3 text-[15px] leading-relaxed font-light text-gray-400">
              This page needs the link from your email — the code that makes the reset possible is
              part of it. Nothing is wrong with your account.
            </p>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Link href="/forgot-password" className={cn(buttonVariants({ size: 'lg' }))}>
                <LinkIcon aria-hidden />
                Send me a new link
              </Link>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
              >
                Back to sign in
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-[15px] leading-relaxed font-light text-gray-400">
              Pick a password you have not used here before. The link stops working the moment this
              succeeds.
            </p>

            <div className="mt-7">
              <ResetPasswordForm token={token} email={session?.user.email ?? null} />
            </div>
          </>
        )}

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
