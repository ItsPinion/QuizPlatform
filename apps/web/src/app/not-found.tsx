import { ArrowLeft, Compass } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Atmosphere } from '@/components/landing/atmosphere';
import { LibraryScene } from '@/components/landing/library-scene';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SkipLink } from '@/components/skip-link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Not found — QuizPlatform',
  description: 'That page is not on the shelf.',
};

/**
 * 404.
 *
 * Without this file Next serves its built-in error page: a white page with
 * system fonts and no way back into the app, which on a dark product reads as a
 * crash. This is the same room as the rest of the site, with the two routes a
 * lost visitor actually wants.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <SiteHeader />

      <main id="main" className="relative flex flex-1 items-center overflow-hidden">
        <Atmosphere className="opacity-60" />

        <div className="relative mx-auto grid w-full max-w-4xl items-center gap-10 px-5 pt-32 pb-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="reveal">
            <p className="text-primary/80 font-mono text-[11px] tracking-[0.2em] uppercase">
              404 · not on the shelf
            </p>
            <h1 className="mt-3 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl">
              This page is missing.
            </h1>
            <p className="text-muted-foreground mt-4 max-w-md text-[15px] leading-relaxed">
              The link may be old, or the quiz may have been unpublished since it was shared.
              Nothing is lost — your attempts and results are stored against your account, not
              against a URL.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className={cn(
                  buttonVariants({ size: 'lg' }),
                  'shine group h-12 rounded-xl px-6 text-[15px]',
                )}
              >
                <ArrowLeft
                  aria-hidden
                  className="transition-transform group-hover:-translate-x-0.5"
                />
                Back to the library
              </Link>
              <Link
                href="/student/quizzes"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'h-12 rounded-xl px-5 text-[15px]',
                )}
              >
                <Compass aria-hidden className="size-4" />
                Browse the quizzes
              </Link>
            </div>
          </div>

          <div className="reveal-scale mx-auto w-full max-w-sm">
            <LibraryScene className="opacity-90 drop-shadow-[0_30px_60px_rgba(0,0,0,0.55)]" />
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
