import { cookies } from 'next/headers';

import { parseTheme, THEME_COOKIE, type Theme } from './theme';

/**
 * The appearance for this request, ready to spread onto a shell.
 *
 * Kept apart from `theme.ts` on purpose: the toggle is a client component and
 * needs `parseTheme`/`THEME_COOKIE`, while `next/headers` may only be imported
 * on the server. One module called from both sides is how a build ends up
 * complaining that the App Router is the Pages Router.
 *
 * The layouts call this instead of setting the attribute in an inline script,
 * which is the usual way: a script runs after the HTML is parsed, so the first
 * frame is always the wrong colour. Reading the cookie before rendering means
 * the first frame is the right one.
 */
export async function themeAttribute(): Promise<{ 'data-theme': Theme }> {
  const store = await cookies();
  return { 'data-theme': parseTheme(store.get(THEME_COOKIE)?.value) };
}
