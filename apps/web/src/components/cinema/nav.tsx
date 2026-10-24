'use client';

import type { AuthUser } from '@quiz/shared/auth';
import {
  ArrowUpRight,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { CinemaWordmark } from '@/components/cinema/logo';
import { MusicToggle } from '@/components/music-toggle';
import { activeHref, areaFor, isActivePath, SITE_LINKS, SITE_SECTIONS } from '@/lib/nav-sections';
import { activeSection } from '@/lib/nav-sections';
import { signOutEverywhere, useSession } from '@/lib/use-session';
import { cn } from '@/lib/utils';

/**
 * The navigation.
 *
 * One thin band across the top of the frame: the mark on the left, the pages in
 * the middle in the smallest voice on the page, the actions on the right. It is
 * fixed over the film and carries no background until the page moves — over a
 * dark hero there is nothing for a bar to separate.
 *
 * Everything it could get wrong is handled here rather than in the page:
 *
 *   - **Where am I** — the current link is white and underlined; on the landing
 *     page the underline follows the section you have scrolled to.
 *   - **One session** — a single `/api/auth/me` shared by the bar, the account
 *     menu and the drawer (`lib/use-session.ts`).
 *   - **A phone** — the links move into a modal drawer instead of disappearing:
 *     Escape closes it, focus is trapped, focus returns to the trigger, the
 *     page behind does not scroll.
 */
const MOBILE_ID = 'site-nav-mobile';

export function NavBar({ version, user }: { version?: string; user?: AuthUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession(user);

  const role = session.status === 'authenticated' ? session.user.role : null;
  const area = areaFor(role);
  const active = activeHref(pathname, SITE_LINKS);

  const [scrolled, setScrolled] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;

    const read = () => {
      frame = 0;
      setScrolled(window.scrollY > 40);
    };

    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(read);
    };

    read();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  /* Which landing section is in front of the viewer. */
  useEffect(() => {
    if (pathname !== '/') {
      setSection(null);
      return;
    }

    const nodes = SITE_SECTIONS.map((id) => document.getElementById(id)).filter(
      (node): node is HTMLElement => node !== null,
    );

    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target.id);
        setSection(activeSection(visible, SITE_SECTIONS));
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
    );

    for (const node of nodes) observer.observe(node);

    return () => observer.disconnect();
  }, [pathname]);

  /* The drawer. */
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  useEffect(() => setOpen(false), [pathname]);

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
    /* A real banner landmark, not a styled div: it is the page's header on every
       route, and assistive tech — and the deployment check — look for it. */
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-[80] transition-colors duration-500',
        scrolled ? 'bg-black/55 backdrop-blur-xl' : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5 sm:px-8 sm:py-6">
        <Link
          href="/"
          aria-label="QuizPlatform — home"
          className="group shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <CinemaWordmark />
        </Link>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-9">
            {SITE_LINKS.map((link) => {
              const id = link.hash ? (link.href.split('#')[1] ?? '') : '';
              const current = link.hash
                ? pathname === '/' && section === id
                : isActivePath(pathname, link.href);

              return (
                <li key={link.href}>
                  <a
                    href={link.href}
                    {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'cine-label group relative inline-flex items-center gap-1 py-2 text-[10px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                      current ? 'text-white' : 'text-gray-300 hover:text-white',
                    )}
                  >
                    {link.label}
                    {link.external ? <ArrowUpRight aria-hidden className="size-2.5" /> : null}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute -bottom-0.5 left-0 h-px w-full origin-left bg-white transition-transform duration-300',
                        current ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
                      )}
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <MusicToggle />

          {session.status === 'loading' ? (
            <span
              aria-hidden
              className="hidden h-11 w-32 animate-pulse rounded-full bg-white/10 sm:block"
            />
          ) : session.status === 'guest' ? (
            <>
              <Link
                href="/login"
                className="cine-label cine-invert hidden items-center rounded-full border border-white/30 px-6 py-3 text-[10px] text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="cine-label hidden items-center rounded-full bg-white px-6 py-3 text-[10px] text-black transition-transform duration-300 hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none sm:inline-flex"
              >
                Get started
              </Link>
            </>
          ) : (
            <>
              {area ? (
                <Link
                  href={area.href}
                  className="cine-label inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[10px] text-black transition-transform duration-300 hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none sm:px-6"
                >
                  {role === 'ADMIN' ? (
                    <ShieldCheck aria-hidden className="size-3.5" />
                  ) : (
                    <LayoutDashboard aria-hidden className="size-3.5" />
                  )}
                  <span className="hidden sm:inline">{area.label}</span>
                </Link>
              ) : null}
              <AccountMenu />
            </>
          )}

          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={MOBILE_ID}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid size-11 place-items-center rounded-full border border-white/25 text-white transition-colors hover:border-white/60 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none lg:hidden"
          >
            {open ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <div
          id={MOBILE_ID}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="mx-4 mb-4 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-3xl border border-white/10 bg-black/90 p-5 backdrop-blur-2xl sm:mx-8 lg:hidden"
        >
          <nav aria-label="Sections">
            <p className="cine-label text-[9px] text-gray-500">The site</p>
            <ul className="mt-2 flex flex-col">
              {SITE_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={close}
                    {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                    className="flex min-h-14 items-center justify-between gap-3 rounded-xl px-2 text-[17px] font-light text-white/90 transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
                  >
                    {link.label}
                    {link.external ? (
                      <ArrowUpRight aria-hidden className="size-4 text-white/40" />
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-5 border-t border-white/10 pt-5">
            {session.status === 'authenticated' ? (
              <>
                <p className="cine-label text-[9px] text-gray-500">
                  {area ? area.label : 'Your account'}
                </p>
                <p className="mt-2 truncate text-[15px] font-light text-white">
                  {session.user.name}
                </p>
                <p className="truncate text-[12px] text-gray-400">{session.user.email}</p>

                <div className="mt-4 flex flex-col gap-2">
                  {area ? (
                    <Link
                      href={area.href}
                      onClick={close}
                      className="cine-label flex h-12 w-full items-center justify-center rounded-full bg-white text-[10px] text-black"
                    >
                      {area.label}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="cine-label flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/25 text-[10px] text-white"
                  >
                    <LogOut aria-hidden className="size-4" />
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href="/register"
                  onClick={close}
                  className="cine-label flex h-12 w-full items-center justify-center rounded-full bg-white text-[10px] text-black"
                >
                  Get started
                </Link>
                <Link
                  href="/login"
                  onClick={close}
                  className="cine-label flex h-12 w-full items-center justify-center rounded-full border border-white/25 text-[10px] text-white"
                >
                  Sign in
                </Link>
              </div>
            )}

            {version ? (
              <p className="mt-4 text-center font-mono text-[10px] text-gray-600">v{version}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}

/**
 * The account button.
 *
 * An invert-on-hover pill with the name on it, opening a menu that holds the
 * role, the way into your area and the way out. Escape closes it, a click
 * outside closes it, and focus returns to the button.
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
          'cine-label cine-invert flex h-11 items-center gap-2 rounded-full border px-5 text-[10px] text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/50',
          open ? 'border-white/60' : 'border-white/25',
        )}
      >
        <span className="max-w-24 truncate">{user.name.split(' ')[0]}</span>
        <ChevronDown
          aria-hidden
          className={cn('size-3 transition-transform duration-300', open && 'rotate-180')}
        />
        <span className="sr-only">Account menu</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute top-14 right-0 w-64 overflow-hidden rounded-2xl border border-white/12 bg-black/90 p-1.5 backdrop-blur-2xl"
        >
          <div className="px-3 py-2.5">
            <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
            <p className="truncate text-[11px] text-gray-400">{user.email}</p>
            <p className="cine-label mt-2 text-[8px] text-gray-500">
              {isAdmin ? 'Administrator' : 'Student'}
            </p>
          </div>

          <div className="my-1 h-px bg-white/10" />

          {area ? (
            <Link
              href={area.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-[13px] text-white/90 transition-colors hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
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
            className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-[13px] text-white/90 transition-colors hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
          >
            <LogOut aria-hidden className="size-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
