'use client';

import type { AuthUser } from '@quiz/shared/auth';
import { ArrowRight, Play } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

import { CinemaFooter } from '@/components/cinema/footer';
import { Magnetic } from '@/components/cinema/magnetic';
import { ScrollCue } from '@/components/cinema/scroll-cue';
import { useSession } from '@/lib/use-session';
import type { LandingPayload } from '@quiz/shared/landing';
import { cn } from '@/lib/utils';

/** The reveal rhythm: every element enters 90ms after the one before it. */
const at = (step: number) => ({ '--reveal-delay': `${step * 90}ms` }) as CSSProperties;

export function CinemaHero({
  payload,
  user,
}: {
  payload: LandingPayload | null;
  /** The session the server read; the buttons paint correctly before hydration. */
  user?: AuthUser | null;
}) {
  const session = useSession(user);
  const role = session.status === 'authenticated' ? session.user.role : null;

  // Every number on this screen is a SQL count from `/api/landing`. When the API
  // cannot answer, the badge says so instead of inventing a figure.
  const live = payload?.database.connected ?? false;
  const published = payload?.counts.quizzes ?? 0;
  const version = payload?.service.version;

  const badge = payload
    ? live
      ? `v${version} · ${published} ${published === 1 ? 'quiz' : 'quizzes'} live`
      : `v${version} · reading room only`
    : 'the library is quiet';

  // Who is asking decides what the buttons do — a signed-in student is one
  // click from a quiz, an administrator from the console.
  const primary =
    role === 'ADMIN'
      ? { href: '/admin', label: 'Open the console' }
      : role === 'STUDENT'
        ? { href: '/student/quizzes', label: 'Take a quiz' }
        : { href: '/register', label: 'Get started' };

  return (
    <section className="relative z-20 flex min-h-[100dvh] flex-col overflow-hidden">
      <div className="flex flex-1 items-center px-6 pt-28 pb-24 sm:px-8 lg:pb-28">
        <div className="mx-auto w-full max-w-6xl">
          {/* The badge: glass, and the only place the version is stated. */}
          <div className="cine-reveal" style={at(0)}>
            <span className="cine-glass cine-label inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 text-[10px] text-white/70">
              <span
                aria-hidden
                className={cn('size-1.5 rounded-full', live ? 'bg-white' : 'bg-white/40')}
              />
              {badge}
            </span>
          </div>

          {/* The headline. Ultra-wide Clash, one weight, and the turn of the
              sentence in italic with the light coming down through it. */}
          <h1
            className="cine-reveal font-display mt-8 text-[clamp(3.2rem,11vw,9rem)] leading-[0.9] font-extralight tracking-tighter"
            style={at(1)}
          >
            <span className="block">Ask better</span>
            <span className="cine-gradient-text block pr-2 pb-[0.06em] italic">questions.</span>
          </h1>

          <p
            className="cine-reveal mt-8 max-w-2xl text-[15px] leading-relaxed font-light text-gray-400 sm:text-base"
            style={at(2)}
          >
            Write the paper, publish it in a click, and the platform grades every attempt the moment
            it is submitted.
            {payload && live ? (
              <>
                {' '}
                {published} {published === 1 ? 'quiz is' : 'quizzes are'} open right now across{' '}
                {payload.counts.categories} categories.
              </>
            ) : null}
          </p>

          <div className="cine-reveal mt-10 flex flex-wrap items-center gap-5" style={at(3)}>
            <Magnetic>
              <Link
                href={primary.href}
                className="cine-slide inline-flex items-center gap-3 rounded-full bg-white px-10 py-5 text-[13px] font-semibold tracking-[0.14em] text-black uppercase"
              >
                <span className="cine-slide__fill" aria-hidden />
                {primary.label}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Magnetic>

            <a href="#tour" className="group inline-flex items-center gap-4 outline-none">
              <span className="grid size-14 place-items-center rounded-full border border-white/25 text-white transition-colors duration-300 group-hover:border-white/60 group-hover:bg-white/5">
                <Play aria-hidden className="size-4 translate-x-px fill-current" />
              </span>
              <span className="cine-label text-[10px] text-gray-300 transition-colors group-hover:text-white">
                How it works
              </span>
            </a>
          </div>
        </div>
      </div>

      <ScrollCue />
      <CinemaFooter />
    </section>
  );
}
