'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { parseTheme, THEME_COOKIE, type Theme } from '@/lib/theme';

/**
 * Light / dark for the consoles.
 *
 * Writes the cookie (so the next request renders the right theme on the server,
 * with no flash) *and* flips the attribute on the nearest themed shell (so the
 * change is instant, without waiting for a round trip). The two cannot disagree:
 * the attribute the CSS reads is the same value that was just written down.
 *
 * Not a `<select>` and not a checkbox: two labelled options in a group, which is
 * what "switch between" means, and what a screen reader announces as one control
 * with two states rather than a mystery toggle.
 */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  // The server render is authoritative; if another tab changed it, follow.
  useEffect(() => {
    setTheme(parseTheme(document.querySelector<HTMLElement>('[data-theme]')?.dataset.theme));
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;

    // Every themed shell in the document — the console has one, but a nested
    // modal or a second shell would be wrong if it kept the old value.
    for (const node of document.querySelectorAll<HTMLElement>('[data-theme]')) {
      node.dataset.theme = next;
    }
  }

  return (
    <div
      role="group"
      aria-label="Appearance"
      className="border-border/70 bg-background/40 inline-flex items-center gap-0.5 rounded-full border p-0.5"
    >
      {(
        [
          { value: 'light' as const, label: 'Light', icon: Sun },
          { value: 'dark' as const, label: 'Dark', icon: Moon },
        ] as const
      ).map((option) => {
        const active = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => apply(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <option.icon aria-hidden className="size-3" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
