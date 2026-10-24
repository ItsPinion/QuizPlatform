import type { LandingPayload } from '@quiz/shared/landing';
import { CirclePlay, KeyRound, ListChecks, Sparkles, Timer, Trophy } from 'lucide-react';

import { Atmosphere } from '@/components/landing/atmosphere';
import { LibraryScene } from '@/components/landing/library-scene';
import { LiveStatus } from '@/components/landing/live-status';
import { SiteFooter } from '@/components/site-footer';
import { SkipLink } from '@/components/skip-link';
import type { AuthUser } from '@quiz/shared/auth';
import { SiteHeader } from '@/components/site-header';
import { cn } from '@/lib/utils';
import { authStats } from '@/lib/auth-params';

/**
 * The frame both auth screens share.
 *
 * Two columns on a wide screen, one on a phone — and the form always comes
 * first, in the DOM and on the screen, because it is the only reason anyone is
 * here. The story column is the argument for signing in, built from the same
 * `/api/landing` payload as the product page, so it cannot claim a catalogue
 * that is not there.
 *
 * Accessibility furniture that a form screen owes its visitors:
 *
 *   - a skip link, because the header is between the top of the page and the form;
 *   - exactly one `<h1>`, on the form;
 *   - `<main>` with an id, so the skip link has somewhere to land;
 *   - `aria-hidden` on every decorative layer, so the grid and the glow do not
 *     exist for a screen reader.
 */

const LOGIN_POINTS = [
  {
    icon: CirclePlay,
    title: 'Resume, do not restart',
    body: 'An attempt lives on the server. Refresh, switch devices, lose wifi — the clock and your answers are still there.',
  },
  {
    icon: ListChecks,
    title: 'The answer key, after',
    body: 'Once a paper is graded you get every question back with the right option, your choice and the reason.',
  },
  {
    icon: Trophy,
    title: 'A rank you can trust',
    body: 'Standings are computed from graded marks, not from what a browser says it scored.',
  },
];

const REGISTER_POINTS = [
  {
    icon: Sparkles,
    title: 'No confirmation email',
    body: 'You are signed in the moment the form is submitted. The first quiz is one click away.',
  },
  {
    icon: Timer,
    title: 'Practice against the clock',
    body: 'Every paper has a real duration and a real pass mark. Untimed practice would teach you the wrong lesson.',
  },
  {
    icon: KeyRound,
    title: 'You keep the receipts',
    body: 'Results, answer keys and history stay in your account — nothing is only in the tab you closed.',
  },
];

const COPY = {
  login: {
    eyebrow: 'Welcome back',
    title: 'Your attempts are still here.',
    body: 'Sign in to pick up a paper that is still on the clock, see exactly which answers missed, and watch your average move as you go.',
  },
  register: {
    eyebrow: 'First time here',
    title: 'Ten minutes to your first result.',
    body: 'One form, no confirmation email, no card. Create the account, pick a published quiz and the grader does the rest.',
  },
} as const;

export function AuthShell({
  payload,
  kind,
  user,
  children,
}: {
  payload: LandingPayload | null;
  kind: 'login' | 'register';
  /** The session the server read, so the header does not flash signed-out. */
  user?: AuthUser | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink href="#auth" label="Skip to the form" />

      <SiteHeader version={payload?.service.version} user={user} />

      <main id="main" className="relative flex-1 overflow-hidden">
        <Atmosphere className="opacity-70" />

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-5 pt-28 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_27rem] lg:items-start lg:gap-16 lg:pt-32 lg:pb-16">
          <div
            id="auth"
            tabIndex={-1}
            className="reveal-scale order-1 w-full max-w-lg lg:order-2 lg:max-w-none"
          >
            {children}
          </div>

          <AuthAside kind={kind} payload={payload} className="order-2 lg:order-1" />
        </div>
      </main>

      <SiteFooter payload={payload} />
    </div>
  );
}

function AuthAside({
  kind,
  payload,
  className,
}: {
  kind: 'login' | 'register';
  payload: LandingPayload | null;
  className?: string;
}) {
  const copy = COPY[kind];
  const stats = authStats(kind, payload);
  const points = kind === 'login' ? LOGIN_POINTS : REGISTER_POINTS;

  return (
    <aside aria-label="About this account" className={cn('w-full', className)}>
      <p className="text-primary/80 font-mono text-[11px] tracking-[0.2em] uppercase">
        {copy.eyebrow}
      </p>

      <h2 className="mt-3 max-w-[18ch] text-3xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl">
        {copy.title}
      </h2>

      <p className="text-muted-foreground mt-4 max-w-md text-base leading-relaxed">{copy.body}</p>

      {stats.length > 0 ? (
        <dl className="border-border/60 mt-7 grid grid-cols-3 gap-4 border-y py-5">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse">
              <dt className="text-muted-foreground mt-1 text-[12px] leading-snug">{stat.label}</dt>
              <dd className="text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <ul className="mt-7 space-y-5">
        {points.map((point) => (
          <li key={point.title} className="flex gap-3.5">
            <span className="border-border/70 bg-card/70 text-primary float-slow mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg border shadow-[0_0_24px_-8px_var(--primary)]">
              <point.icon aria-hidden className="size-4" />
            </span>
            <div>
              <p className="text-[15px] font-medium">{point.title}</p>
              <p className="text-muted-foreground mt-1 max-w-sm text-[13.5px] leading-relaxed">
                {point.body}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-7">
        <LiveStatus payload={payload} />
      </div>

      <LibraryScene className="mt-8 hidden max-w-[15rem] opacity-80 lg:block" />
    </aside>
  );
}
