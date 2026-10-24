import { cn } from '@/lib/utils';

/**
 * The mark, in monochrome.
 *
 * A white circle with the book-and-check cut out of it in black — the same
 * drawing as `components/brand/logo.tsx`, stripped of its gradient plate so it
 * holds up against film. At 40px it has to survive being the only piece of
 * brand on a black-and-white page, so the glyph is drawn on the same 32-unit
 * grid and keeps its square geometry rather than being redrawn by hand.
 */
export function CinemaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden focusable="false" className={cn('size-10', className)}>
      <circle cx="16" cy="16" r="16" fill="#ffffff" />
      {/* Bookmark ribbon. */}
      <path d="M9.6 10.4h2.8v7.4l-1.4-1.5-1.4 1.5z" fill="#000000" opacity="0.55" />
      {/* Left page, then right page, then the gutter between them. */}
      <path d="M6.8 10.6 15.1 12.2v11.4L6.8 22.3z" fill="#000000" />
      <path d="M25.2 10.6 16.9 12.2v11.4l8.3-1.3z" fill="#000000" opacity="0.8" />
      <rect x="15.1" y="11.9" width="1.8" height="12.2" fill="#ffffff" />
      {/* The check, cut back out of the right page. */}
      <path
        d="M19.4 17.4l2 2.1 3.8-4.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
    </svg>
  );
}

/** The mark plus the wordmark, as the nav and the drawer both show it. */
export function CinemaWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <CinemaLogo />
      {compact ? null : (
        <span className="hidden text-[13px] font-medium tracking-[0.18em] text-white uppercase sm:block">
          QuizPlatform
        </span>
      )}
    </span>
  );
}
