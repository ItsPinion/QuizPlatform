'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Magnetic: the element leans toward the cursor, then springs back.
 *
 * It is a *wrapper*, not a button, so it can hold a `<Link>`, a `<button>` or a
 * pair of them without changing what they are. The transform goes on the
 * wrapper and the pointer maths never touches the child, so hover, focus and
 * click all still land where the browser expects.
 *
 * It is switched off — completely, including the listener — when either:
 *
 *   - the pointer is coarse (a thumb has no cursor to lean toward), or
 *   - the visitor asked for reduced motion.
 *
 * Both are read live from `matchMedia`, so changing the OS setting mid-session
 * takes effect without a reload.
 */
export function Magnetic({
  children,
  strength = 14,
  className,
}: {
  children: ReactNode;
  /** How many pixels the element can travel at the very edge. */
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');

    const sync = () => setEnabled(fine.matches && !still.matches);

    sync();
    fine.addEventListener('change', sync);
    still.addEventListener('change', sync);

    return () => {
      fine.removeEventListener('change', sync);
      still.removeEventListener('change', sync);
    };
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      if (!enabled || !ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);

      // Normalised to -1..1 at the edges, then damped: the element follows the
      // cursor but never reaches it, which is what reads as weight.
      ref.current.style.transform = `translate3d(${(dx / rect.width) * strength * 2}px, ${
        (dy / rect.height) * strength * 2
      }px, 0)`;
    },
    [enabled, strength],
  );

  const reset = useCallback(() => {
    if (ref.current) ref.current.style.transform = '';
  }, []);

  return (
    <span
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onBlur={reset}
      className={cn(
        'inline-block transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none',
        className,
      )}
    >
      {children}
    </span>
  );
}
