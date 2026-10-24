/**
 * Appearance.
 *
 * The product is dark by default — the landing page is a film and the consoles
 * are the same room with the lights low. But a dashboard is read for an hour at
 * a time, often in daylight, so §26's light theme is a real requirement rather
 * than a checkbox: every token flips, and so do the handful of raw utilities
 * (`text-white`, `bg-white/6`) the components use directly.
 *
 * Two decisions worth knowing:
 *
 * - **The theme is scoped to a wrapper, not to `<html>`.** The landing page is a
 *   film; flipping it to paper would destroy the one thing it is built around.
 *   Consoles and auth screens opt in by putting `data-theme` on their own shell,
 *   and the CSS overrides are all descendants of that attribute.
 * - **The cookie is the source of truth, read on the server.** No flash of the
 *   wrong theme on first paint, and it survives a new tab. The reading half
 *   lives in `theme-server.ts`, because this module is imported by a client
 *   component and `next/headers` cannot cross that boundary.
 */
export const THEME_COOKIE = 'quiz_theme';

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(value: string | undefined | null): Theme {
  return value === 'light' ? 'light' : 'dark';
}
