'use client';

import {
  ArrowUpRight,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Logo } from '@/components/brand/logo';
import { MusicToggle } from '@/components/music-toggle';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  SITE_LINKS,
  SITE_SECTIONS,
  activeHref,
  activeSection,
  areaFor,
  isActivePath,
} from '@/lib/nav-sections';
import { signOutEverywhere, useSession } from '@/lib/use-session';
import { cn } from '@/lib/utils';

/**
 * The navigation bar.
 *
 * What makes it a bar rather than a row of links:
 *
 *   - **It answers "where am I?"** — the current page is a filled pill with
 *     `aria-current="page"`, and on the landing page the pill follows the
 *     section you have scrolled to.
 *   - **It shrinks.** 64px at the top of the page, 56px once you scroll, with a
 *     2px progress line showing how far through the page you are.
 *   - **It has a mobile menu that behaves.** The old bar simply hid its links
 *     below `md` and left a phone visitor with no way to reach anything. The
 *     drawer traps nothing it cannot escape: Escape closes it, the backdrop
 *     closes it, focus goes to the first link on open and back to the button on
 *     close, and the page behind it does not scroll.
 *   - **It keeps one session.** `useSession` shares a single `/api/auth/me`
 *     between the bar, the menu and the account button.
 */

const MOBILE_ID = 'site-nav-mobile';

export function NavBar({ version }: { version?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();

  const role = session.status === 'authenticated' ? session.user.role : null;
  const area = areaFor(role);
  const active = activeHref(pathname, SITE_LINKS);

  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [section, setSection] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /* ------------------------------ scrolling ------------------------------ */

  useEffect(() => {
    let frame = 0;

    const read = () => {
      frame = 0;

      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;

      setScrolled(window.scrollY > 8);
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };

    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(read);
    };

    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  /* --------------------------- landing sections -------------------------- */

  useEffect(() => {
    if (pathname !== '/') {
      setSection(null);
      return;
    }

    const nodes = SITE_SECTIONS.map((id) => document.getElementById(id)).filter(
      (node): node is HTMLElement => node !== null,
    );

    if (nodes.length === 0) return;

    // A thin band across the middle of the viewport: whichever section crosses
    // it is the one you are reading.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target.id);

        setSection(activeSection(visible, SITE_SECTIONS));
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );

    for (const node of nodes) observer.observe(node);

    return () => observer.disconnect();
  }, [pathname]);

  /* ------------------------------ the drawer ----------------------------- */

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first link, not the panel: the panel is a container.
    const first = panelRef.current?.querySelector<HTMLElement>('a, button');
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      // Keep Tab inside the drawer while it is modal.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusable.length === 0) return;

      const firstEl = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  // A route change closes the drawer; so does growing past the breakpoint.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (media.matches) setOpen(false);
    };

    media.addEventListener('change', onChange);

    return () => media.removeEventListener('change', onChange);
  }, []);

  async function handleSignOut() {
    setOpen(false);
    await signOutEverywhere();
    router.refresh();
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-[background-color,border-color,box-shadow,height] duration-300',
        scrolled
          ? 'border-border/80 bg-background/85 shadow-[0_18px_50px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl'
          : 'border-border/40 bg-background/55 backdrop-blur-xl',
      )}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-6xl items-center gap-3 px-5 transition-[height] duration-300 sm:px-8',
          scrolled ? 'h-14' : 'h-16',
        )}
      >
        <Link
          href="/"
          aria-label="QuizPlatform — home"
          className="group focus-visible:ring-ring/60 flex shrink-0 items-center rounded-lg outline-none focus-visible:ring-[3px]"
        >
          <Logo
            version={version}
            markClassName="size-9 transition-transform duration-500 group-hover:rotate-[-4deg] group-hover:scale-105"
          />
        </Link>

        {/* ---------------------------- centre nav ---------------------------- */}
        <nav aria-label="Primary" className="ml-4 hidden lg:block">
          <ul className="flex items-center gap-1">
            {SITE_LINKS.map((link) => {
              const id = link.hash ? (link.href.split('#')[1] ?? '') : '';
              const current = link.hash
                ? pathname === '/' && section === id
                : isActivePath(pathname, link.href);

              return (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground hover:bg-accent/60 focus-visible:ring-ring/60 inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-[13px] transition-colors outline-none focus-visible:ring-[3px]"
                    >
                      {link.label}
                      <ArrowUpRight aria-hidden className="size-3" />
                    </a>
                  ) : (
                    <a
                      href={link.href}
                      aria-current={current ? 'true' : undefined}
                      className={cn(
                        'focus-visible:ring-ring/60 relative inline-flex h-9 items-center rounded-full px-3.5 text-[13px] transition-colors outline-none focus-visible:ring-[3px]',
                        current
                          ? 'bg-primary/15 text-foreground ring-primary/25 ring-1'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                      )}
                    >
                      {current ? (
                        <span
                          aria-hidden
                          className="bg-primary shadow-primary/80 absolute left-2 size-1 rounded-full shadow-[0_0_10px]"
                        />
                      ) : null}
                      <span className={cn(current && 'pl-2.5')}>{link.label}</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <MusicToggle />

          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            aria-label="API health (opens in a new tab)"
            title="API health"
            className="text-muted-foreground hover:text-foreground hover:border-border focus-visible:ring-ring/60 border-border/60 hidden size-9 place-items-center rounded-full border transition-colors outline-none focus-visible:ring-[3px] md:grid"
          >
            <span aria-hidden className="relative grid place-items-center">
              <span className="bg-success absolute inset-0 animate-ping rounded-full opacity-40 motion-reduce:hidden" />
              <span className="bg-success size-1.5 rounded-full" />
            </span>
          </a>

          <span aria-hidden className="bg-border/70 hidden h-6 w-px md:block" />

          {/* --------------------------- the session -------------------------- */}
          {session.status === 'loading' ? (
            <div aria-hidden className="bg-muted/50 h-9 w-32 animate-pulse rounded-lg" />
          ) : session.status === 'guest' ? (
            <>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'hidden text-[13px] sm:inline-flex',
                )}
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className={cn(
                  buttonVariants({ size: 'sm' }),
                  'shine text-[13px] font-semibold',
                  'h-9 rounded-lg px-3.5',
                )}
              >
                Get started
              </Link>
            </>
          ) : (
            <>
              {area ? (
                <Link
                  href={area.href}
                  className={cn(
                    buttonVariants({ size: 'sm' }),
                    'shine shadow-primary/40 h-9 gap-2 rounded-lg px-3 text-[13px] font-semibold shadow-[0_10px_30px_-14px] sm:px-3.5',
                  )}
                >
                  {role === 'ADMIN' ? (
                    <ShieldCheck aria-hidden className="size-4" />
                  ) : (
                    <LayoutDashboard aria-hidden className="size-4" />
                  )}
                  <span className="hidden sm:inline">
                    {area.short === 'Dashboard' ? 'My dashboard' : 'Admin console'}
                  </span>
                  <span className="sm:hidden">{area.short}</span>
                </Link>
              ) : null}

              <AccountMenu />
            </>
          )}

          {/* ------------------------- mobile trigger ------------------------- */}
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={MOBILE_ID}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className={cn(
              'border-border/70 text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 grid size-9 place-items-center rounded-full border transition-colors outline-none focus-visible:ring-[3px] lg:hidden',
              open && 'border-primary/40 text-foreground bg-primary/10',
            )}
          >
            {open ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
          </button>
        </div>
      </div>

      {/* -------------------------- scroll progress -------------------------- */}
      <div aria-hidden className="bg-border/40 absolute inset-x-0 bottom-0 h-px">
        <div
          className="from-primary h-full origin-left bg-gradient-to-r via-violet-400 to-sky-400 transition-[width] duration-150"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* ------------------------------ the drawer --------------------------- */}
      {open ? (
        <div
          id={MOBILE_ID}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="bg-background/97 absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-2xl lg:hidden"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8">
            <nav aria-label="Sections">
              <p className="text-muted-foreground/80 font-mono text-[10px] tracking-[0.2em] uppercase">
                The site
              </p>
              <ul className="mt-2 flex flex-col">
                {SITE_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={close}
                      className="hover:bg-accent/60 focus-visible:ring-ring/60 flex min-h-14 items-center justify-between gap-3 rounded-xl px-3 text-[17px] font-medium transition-colors outline-none focus-visible:ring-[3px]"
                    >
                      {link.label}
                      {link.external ? (
                        <ArrowUpRight aria-hidden className="text-muted-foreground size-4" />
                      ) : null}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    href="/api/health"
                    target="_blank"
                    rel="noreferrer"
                    onClick={close}
                    className="hover:bg-accent/60 focus-visible:ring-ring/60 flex min-h-14 items-center justify-between gap-3 rounded-xl px-3 text-[17px] font-medium transition-colors outline-none focus-visible:ring-[3px]"
                  >
                    API health
                    <ArrowUpRight aria-hidden className="text-muted-foreground size-4" />
                  </a>
                </li>
              </ul>
            </nav>

            {session.status === 'authenticated' ? (
              <div className="border-border/60 border-t pt-5">
                <p className="text-muted-foreground/80 font-mono text-[10px] tracking-[0.2em] uppercase">
                  {area ? area.label : 'Your account'}
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <span className="bg-primary/15 text-primary grid size-10 place-items-center rounded-full">
                    {role === 'ADMIN' ? (
                      <ShieldCheck aria-hidden className="size-4" />
                    ) : (
                      <UserRound aria-hidden className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">
                      {session.user.name}
                    </span>
                    <span className="text-muted-foreground block truncate text-[12px]">
                      {session.user.email}
                    </span>
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {area ? (
                    <Link
                      href={area.href}
                      onClick={close}
                      className={cn(buttonVariants({ size: 'lg' }), 'h-12 w-full text-[15px]')}
                    >
                      {area.label}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'lg' }),
                      'h-12 w-full text-[15px]',
                    )}
                  >
                    <LogOut aria-hidden className="size-4" />
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-border/60 flex flex-col gap-2 border-t pt-5">
                <Link
                  href="/register"
                  onClick={close}
                  className={cn(buttonVariants({ size: 'lg' }), 'h-12 w-full text-[15px]')}
                >
                  Get started
                </Link>
                <Link
                  href="/login"
                  onClick={close}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'lg' }),
                    'h-12 w-full text-[15px]',
                  )}
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}

/**
 * The account button.
 *
 * A menu, not three loose controls: the name, the role, the way into your area
 * and the way out. Escape closes it, a click outside closes it, and focus
 * returns to the button — which is the whole difference between a dropdown and
 * a trap.
 */
function AccountMenu() {
  const router = useRouter();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const menuId = `account-menu-${useId().replace(/:/g, '')}`;

  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (session.status !== 'authenticated') return null;

  const { user } = session;
  const isAdmin = user.role === 'ADMIN';
  const area = areaFor(user.role);

  return (
    <div ref={wrapRef} className="relative hidden sm:block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        className={cn(
          'border-border/70 bg-card/60 hover:border-primary/40 focus-visible:ring-ring/60 flex h-9 items-center gap-1.5 rounded-full border py-1 pr-2 pl-1 transition-colors outline-none focus-visible:ring-[3px]',
          open && 'border-primary/40 bg-primary/10',
        )}
      >
        <span className="bg-primary/15 text-primary grid size-7 place-items-center rounded-full">
          {isAdmin ? (
            <ShieldCheck aria-hidden className="size-3.5" />
          ) : (
            <UserRound aria-hidden className="size-3.5" />
          )}
        </span>
        <span className="max-w-28 truncate text-xs font-medium">{user.name}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'text-muted-foreground size-3.5 transition-transform',
            open && 'rotate-180',
          )}
        />
        <span className="sr-only">Account menu</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="border-border/80 bg-popover/95 absolute top-11 right-0 w-64 overflow-hidden rounded-xl border p-1.5 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.95)] backdrop-blur-xl"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="text-muted-foreground truncate text-[11.5px]">{user.email}</p>
            <Badge variant={isAdmin ? 'warning' : 'secondary'} className="mt-1.5 text-[10px]">
              {isAdmin ? 'Administrator' : 'Student'}
            </Badge>
          </div>

          <div className="bg-border/60 my-1 h-px" />

          {area ? (
            <Link
              href={area.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="hover:bg-accent focus-visible:ring-ring/60 flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors outline-none focus-visible:ring-[3px]"
            >
              {isAdmin ? (
                <ShieldCheck aria-hidden className="size-4" />
              ) : (
                <LayoutDashboard aria-hidden className="size-4" />
              )}
              {area.label}
            </Link>
          ) : null}

          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOutEverywhere();
              router.refresh();
            }}
            className="hover:bg-accent focus-visible:ring-ring/60 flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors outline-none focus-visible:ring-[3px]"
          >
            <LogOut aria-hidden className="size-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
