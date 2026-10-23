'use client';

import { CircleAlert, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The route error boundary.
 *
 * Next's default is a bare white page with a stack trace in development and
 * nothing useful in production. This one says what happened, offers the one
 * action that usually fixes it, and keeps the digest so a report can be traced
 * back to the server log.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The browser console is the only place a client sees this; the server log
    // has the same digest.
    console.error('Route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="glow-frame border-border/70 bg-card/70 w-full max-w-lg rounded-2xl border p-8 text-center">
        <span className="bg-destructive/15 text-destructive mx-auto grid size-12 place-items-center rounded-full">
          <CircleAlert aria-hidden className="size-6" />
        </span>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          Something broke on this page.
        </h1>
        <p className="text-muted-foreground mt-3 text-[14.5px] leading-relaxed">
          The rest of the app is fine. Try again — and if it keeps happening, the reference below is
          what the server logged.
        </p>

        {error.digest ? (
          <p className="text-muted-foreground/80 bg-background/60 border-border/60 mt-4 rounded-lg border px-3 py-2 font-mono text-[11px]">
            {error.digest}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className={cn(buttonVariants({ size: 'lg' }), 'h-12 rounded-xl px-6 text-[15px]')}
          >
            <RotateCcw aria-hidden className="size-4" />
            Try again
          </button>
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'h-12 rounded-xl px-5 text-[15px]',
            )}
          >
            Back to the start
          </Link>
        </div>
      </div>
    </div>
  );
}
