import { NavBar } from '@/components/nav/nav-bar';

/**
 * The header every page shares.
 *
 * A thin server wrapper around the client bar: the bar needs `usePathname` for
 * the active link, `useSession` for the account controls and a scroll listener
 * for its own size, so it lives on the client. `version` still arrives from the
 * server render.
 */
export function SiteHeader({ version }: { version?: string } = {}) {
  return <NavBar version={version} />;
}
