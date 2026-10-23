/**
 * What the navigation bar shows, and which of it is current.
 *
 * Kept out of the component because "is this link active?" is the one rule in a
 * nav that people notice when it is wrong, and it is much easier to prove with
 * a table of cases than by clicking around a browser.
 */

export interface NavLink {
  href: string;
  label: string;
  /** Leaves the app entirely — rendered with an arrow and a new tab. */
  external?: boolean;
  /** An on-page anchor (`#tour`), highlighted by scroll position, not pathname. */
  hash?: boolean;
}

/** The global links. They work from inside the app, because they are absolute. */
export const SITE_LINKS: readonly NavLink[] = [
  { href: '/#platform', label: 'Platform', hash: true },
  { href: '/#tour', label: 'Tour', hash: true },
  { href: 'https://github.com/ItsPinion/QuizPlatform#readme', label: 'Docs', external: true },
];

/** Where a role's own area begins. The header button and the mobile sheet share it. */
export const AREA: Record<string, { label: string; href: string; short: string }> = {
  ADMIN: { label: 'Admin console', short: 'Console', href: '/admin' },
  STUDENT: { label: 'Student dashboard', short: 'Dashboard', href: '/student' },
};

export function areaFor(role: string | null | undefined) {
  return (role && AREA[role]) || null;
}

/** The part of a URL this router cares about: pathname only, no origin, no query. */
export function pathnameOf(url: string): string {
  try {
    return new URL(url, 'http://local').pathname;
  } catch {
    return url;
  }
}

/**
 * Does `href` cover `pathname`?
 *
 * Exact match, or a path that continues after a slash — so `/student` covers
 * `/student/results` but `/stud` and `/studentish` cover nothing.
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href.startsWith('http') || href.startsWith('#')) return false;

  const target = pathnameOf(href);

  if (target === '/') return pathname === '/';
  if (pathname === target) return true;

  return pathname.startsWith(`${target}/`);
}

/**
 * The single most specific match.
 *
 * `/student` and `/student/results` both "cover" `/student/results`, and only
 * one of them may be highlighted — the longer one, because it is the more
 * precise statement about where you are.
 */
export function activeHref(pathname: string, links: readonly NavLink[]): string | null {
  const matches = links.filter((link) => isActivePath(pathname, link.href));

  if (matches.length === 0) return null;

  return matches.reduce((best, link) =>
    pathnameOf(link.href).length > pathnameOf(best.href).length ? link : best,
  ).href;
}

/**
 * Which landing-page section is under the header.
 *
 * Fed the ids of the sections currently intersecting the viewport, returns the
 * one the nav should mark. Sections are ordered, so the first match wins — the
 * page reads top to bottom.
 */
export function activeSection(
  sectionIds: readonly string[],
  order: readonly string[],
): string | null {
  for (const id of order) {
    if (sectionIds.includes(id)) return id;
  }

  return null;
}

/** The anchors in `SITE_LINKS`, as bare ids, for the scroll spy to watch. */
export const SITE_SECTIONS = SITE_LINKS.filter((link) => link.hash).map((link) =>
  (link.href.split('#')[1] ?? '').trim(),
);
