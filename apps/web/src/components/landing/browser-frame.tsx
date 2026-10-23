import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * A window chrome around a product shot.
 *
 * Every "screenshot" on this page is live markup rather than an image: it stays
 * sharp on any display, follows the theme, and cannot drift from the components
 * the app actually renders. The frame is what tells a visitor they are looking
 * at software rather than decoration.
 */
export function BrowserFrame({
  path,
  children,
  className,
  tone = 'primary',
}: {
  path: string;
  children: ReactNode;
  className?: string;
  tone?: 'primary' | 'sky' | 'success';
}) {
  const glow =
    tone === 'sky'
      ? 'shadow-[0_50px_120px_-70px_oklch(0.74_0.13_215)]'
      : tone === 'success'
        ? 'shadow-[0_50px_120px_-70px_var(--success)]'
        : 'shadow-[0_50px_120px_-70px_var(--primary)]';

  return (
    <div
      className={cn(
        'border-border/80 bg-card/70 overflow-hidden rounded-xl border backdrop-blur-sm',
        glow,
        className,
      )}
    >
      <div className="border-border/70 bg-muted/25 flex items-center gap-2 border-b px-3 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-[#ff5f57]/70" />
          <span className="size-2 rounded-full bg-[#febc2e]/70" />
          <span className="size-2 rounded-full bg-[#28c840]/70" />
        </span>
        <span className="text-muted-foreground ml-1 truncate font-mono text-[10px]">{path}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
