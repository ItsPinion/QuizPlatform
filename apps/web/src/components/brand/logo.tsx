import { MARK_GRID, MARK_RING, MARK_TAIL, WORDMARK } from '@/lib/logo-geometry';
import { cn } from '@/lib/utils';

/**
 * The mark.
 *
 * A **Q**, drawn as geometry: one heavy ring, one dot set on the 45° axis just
 * outside it, on a 32-unit grid. That is the whole logo.
 *
 * It replaces an open book with a check etched into the page — a drawing that
 * needed a plate, two gradients, a rim light and eleven paths to say "a library
 * that grades things", and that turned to mush below 28px. This one is two
 * primitives. It holds at 16px in a tab, at 32px in the bar and at 256px on a
 * poster, because there is nothing in it to lose.
 *
 * Why a Q: the product is quizzes, and the letter is the one part of the name
 * nobody has to be taught. The detached dot does the rest — read one way it is a
 * Q's tail, read another it is a full stop after a finished paper, and either way
 * it stops the ring from reading as a loading spinner.
 *
 * It draws in `currentColor`, so it is white on the film, near-black on paper and
 * grey in a footer without a single hex in this file. The geometry itself, and
 * why each number is that number, lives in `lib/logo-geometry.ts`.
 */
export function LogoMark({
  className,
  title,
  tailClassName,
}: {
  className?: string;
  /** An accessible name. Omit it wherever the link around the mark already has one. */
  title?: string;
  /** Extra classes for the tail — the header eases it outward on hover. */
  tailClassName?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${MARK_GRID} ${MARK_GRID}`}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      fill="none"
      className={cn('size-8 shrink-0', className)}
    >
      <circle
        cx={MARK_RING.cx}
        cy={MARK_RING.cy}
        r={MARK_RING.r}
        stroke="currentColor"
        strokeWidth={MARK_RING.strokeWidth}
      />
      <circle
        cx={MARK_TAIL.cx}
        cy={MARK_TAIL.cy}
        r={MARK_TAIL.r}
        fill="currentColor"
        className={tailClassName}
      />
    </svg>
  );
}

/**
 * Mark + wordmark.
 *
 * The word is set the way a small brand should be: one weight, tight tracking, no
 * colour split. The mark carries the identity; the word only has to be readable
 * next to it. `version` stays in mono, because a number is data and data is
 * monospaced here.
 */
export function Logo({
  className,
  version,
  markClassName,
  wordClassName,
}: {
  className?: string;
  version?: string;
  markClassName?: string;
  wordClassName?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={cn('size-7', markClassName)} />
      <span className={cn('text-[15px] font-medium tracking-[-0.01em]', wordClassName)}>
        {WORDMARK}
      </span>
      {version ? (
        <span className="text-muted-foreground hidden font-mono text-[10.5px] sm:inline">
          v{version}
        </span>
      ) : null}
    </span>
  );
}
