import type { AuthUser } from '@quiz/shared/auth';

import { NavBar } from '@/components/cinema/nav';

/**
 * The header every page shares.
 *
 * A thin server wrapper around the client bar: the bar needs `usePathname` for
 * the active link, `useSession` for the account controls and a scroll listener
 * for its own background, so it lives on the client. `version` still arrives
 * from the server render.
 */
export function SiteHeader({
  version,
  user,
}: {
  version?: string;
  /** The session the server already read, so the bar paints the right controls. */
  user?: AuthUser | null;
} = {}) {
  return <NavBar version={version} user={user} />;
}
