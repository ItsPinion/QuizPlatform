import { cn } from '@/lib/utils';

/**
 * The mark.
 *
 * The old logo was a letter Q in a rounded square, which is what you get when a
 * logo is a placeholder. This one is the product: an open book (the library, the
 * questions) with a check etched into the right-hand page (the grader), under a
 * lamp-warm rim light.
 *
 * It is drawn on a 32-unit grid with square geometry so it survives being 20px
 * in a footer or 96px on a login page, and it takes its colour from the theme —
 * no baked-in hex beyond the two gradient stops.
 */
export function LogoMark({
  className,
  glow = true,
  title,
}: {
  className?: string;
  glow?: boolean;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('size-9 shrink-0', glow && 'glow-pulse', className)}
    >
      <defs>
        <linearGradient id="logo-plate" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.19 292)" />
          <stop offset="55%" stopColor="oklch(0.62 0.21 285)" />
          <stop offset="100%" stopColor="oklch(0.58 0.17 258)" />
        </linearGradient>
        <linearGradient id="logo-page" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.99 0.004 285)" />
          <stop offset="100%" stopColor="oklch(0.9 0.02 285)" />
        </linearGradient>
        <linearGradient id="logo-page-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="oklch(0.99 0.004 285)" />
          <stop offset="100%" stopColor="oklch(0.86 0.03 292)" />
        </linearGradient>
      </defs>

      {/* The plate: a soft square, not a circle, so the book has a shelf to sit on. */}
      <rect x="0" y="0" width="32" height="32" rx="9" fill="url(#logo-plate)" />
      <rect
        x="0.75"
        y="0.75"
        width="30.5"
        height="30.5"
        rx="8.25"
        fill="none"
        stroke="oklch(1 0 0 / 22%)"
        strokeWidth="1.5"
      />

      {/* Bookmark ribbon, hanging out of the left page. */}
      <path d="M9 10.6h3.4v8.2L10.7 17l-1.7 1.8z" fill="oklch(0.82 0.16 85)" />

      {/* Left page. */}
      <path d="M6.6 10.2 15.1 12v12.1L6.6 22.3z" fill="url(#logo-page)" />
      {/* Right page, shaded so the gutter reads as a fold. */}
      <path d="M25.4 10.2 16.9 12v12.1l8.5-1.8z" fill="url(#logo-page-shade)" />
      {/* The gutter. */}
      <rect x="15.1" y="11.7" width="1.8" height="12.6" fill="oklch(0.42 0.06 285)" />

      {/* The check: what makes it an assessment and not a bookshop. */}
      <path
        d="M19.6 17.2l1.9 2 3.6-4.3"
        fill="none"
        stroke="oklch(0.55 0.19 288)"
        strokeWidth="2.1"
        strokeLinecap="square"
      />
    </svg>
  );
}

/**
 * Mark + wordmark.
 *
 * The wordmark is set in the same weight as the headings, with the last word in
 * the accent — enough to read as a brand next to a mark that already carries
 * the colour.
 */
export function Logo({
  className,
  version,
  markClassName,
  glow = true,
}: {
  className?: string;
  version?: string;
  markClassName?: string;
  glow?: boolean;
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={markClassName} glow={glow} />
      <span className="flex items-baseline gap-2">
        <span className="text-[15.5px] font-semibold tracking-tight">
          Quiz<span className="text-primary">Platform</span>
        </span>
        {version ? (
          <span className="text-muted-foreground hidden font-mono text-[10.5px] sm:inline">
            v{version}
          </span>
        ) : null}
      </span>
    </span>
  );
}
