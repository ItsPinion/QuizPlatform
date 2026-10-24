import { LogoMark } from '@/components/brand/logo';
import { WORDMARK } from '@/lib/logo-geometry';
import { cn } from '@/lib/utils';

/**
 * The mark, as the film needs it.
 *
 * The same drawing as `components/brand/logo.tsx` — one source, so the header, the
 * footer and the favicon cannot drift apart — sized for the bar and painted in
 * `currentColor`, so it is white here, near-black on the light theme and grey in
 * the footer without an override.
 *
 * The only difference is the tail: in the header it eases a pixel outward on
 * hover, which reads as the mark taking a breath rather than an animation
 * playing. It is a transition, not a keyframe, so `prefers-reduced-motion` costs
 * nothing — `motion-reduce` simply drops the movement.
 */
export function CinemaLogo({ className }: { className?: string }) {
  return (
    <LogoMark
      className={cn('size-8', className)}
      tailClassName="origin-center transition-transform duration-300 motion-reduce:transition-none group-hover:translate-x-[1.2px] group-hover:translate-y-[1.2px]"
    />
  );
}

/**
 * The mark plus the wordmark, as the bar and the drawer both show it.
 *
 * Title case, 15px, tight — the same voice as the body, not a shout. The previous
 * wordmark was all caps at 0.18em tracking, which put the brand and the 10px caps
 * navigation links at the same volume.
 */
export function CinemaWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <CinemaLogo />
      {compact ? null : (
        <span className="hidden text-[15px] font-medium tracking-[-0.01em] text-white sm:block">
          {WORDMARK}
        </span>
      )}
    </span>
  );
}
