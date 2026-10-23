'use client';

import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Bento primitives.
 *
 * The same idea as the MagicBento reference — a light that follows the pointer,
 * a lit border, tilt, drifting stars and a pull toward the cursor — implemented
 * with CSS custom properties instead of GSAP:
 *
 *   • no runtime dependency and nothing in the bundle beyond this file;
 *   • every animated property is a CSS variable or a CSS animation, so the
 *     compositor does the work and React never re-renders on pointer move;
 *   • motion is opt-in twice: only for a fine pointer, and never when the
 *     visitor asked for reduced motion.
 *
 * Intensity is per card, not global: the showcase grid earns the stars and the
 * magnetism, a list of thirteen reference cells does not.
 */

export type BentoTone = 'primary' | 'sky' | 'success' | 'warning';

/** Glow colour per card, set as a CSS variable the pseudo-elements read. */
const TONE_CLASS: Record<BentoTone, string> = {
  primary: '[--bento-glow:var(--primary)]',
  sky: '[--bento-glow:oklch(0.74_0.13_215)]',
  success: '[--bento-glow:var(--success)]',
  warning: '[--bento-glow:var(--warning)]',
};

/** Enough to feel alive, not enough to blur the text underneath. */
const MAX_TILT = 8;
/** Pixels the card is allowed to lean toward the cursor. */
const MAX_MAGNET = 6;

interface BentoCardProps {
  children: ReactNode;
  tone?: BentoTone;
  href?: string;
  /** Tilt and follow the pointer. Off for dense or text-heavy cards. */
  interactive?: boolean;
  /** Stars that drift out from the pointer when the card is entered. */
  particles?: number;
  /** Lean a few pixels toward the cursor. */
  magnet?: boolean;
  /** Ripple from the point that was pressed. Only meaningful on a link. */
  ripple?: boolean;
  className?: string;
}

export function BentoCard({
  children,
  tone = 'primary',
  href,
  interactive = true,
  particles = 0,
  magnet = false,
  ripple = false,
  className,
}: BentoCardProps) {
  const motion = useRef(true);
  const hovered = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      motion.current = !query.matches;
    };

    sync();
    query.addEventListener('change', sync);

    return () => {
      query.removeEventListener('change', sync);
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    };
  }, []);

  const clearStars = (element: HTMLElement) => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    element.querySelectorAll('.bento-star').forEach((star) => star.remove());
  };

  const spawnStars = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();

    for (let index = 0; index < particles; index += 1) {
      const timer = window.setTimeout(() => {
        if (!hovered.current) return;

        const star = document.createElement('span');

        star.className = 'bento-star';
        star.setAttribute('aria-hidden', 'true');
        star.style.left = `${Math.random() * rect.width}px`;
        star.style.top = `${Math.random() * rect.height}px`;
        star.style.setProperty('--dx', `${(Math.random() - 0.5) * 90}px`);
        star.style.setProperty('--dy', `${(Math.random() - 0.5) * 90}px`);
        star.style.setProperty('--spin', `${Math.random() * 360}deg`);
        star.style.animationDelay = `${Math.random() * 140}ms`;
        star.addEventListener('animationend', () => star.remove(), { once: true });

        element.appendChild(star);
      }, index * 80);

      timers.current.push(timer);
    }
  };

  const handleEnter = (event: PointerEvent<HTMLElement>) => {
    hovered.current = true;

    if (event.pointerType !== 'mouse' || !motion.current || particles === 0) return;

    spawnStars(event.currentTarget);
  };

  const handleMove = (event: PointerEvent<HTMLElement>) => {
    // A mouse, not a finger: on touch the light would stick where the tap landed.
    if (event.pointerType !== 'mouse') return;

    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    element.style.setProperty('--mx', `${x}px`);
    element.style.setProperty('--my', `${y}px`);

    if (!motion.current) return;

    const offsetX = (x - rect.width / 2) / (rect.width / 2);
    const offsetY = (y - rect.height / 2) / (rect.height / 2);

    if (interactive) {
      element.style.setProperty('--rx', `${(-offsetY * MAX_TILT).toFixed(2)}deg`);
      element.style.setProperty('--ry', `${(offsetX * MAX_TILT).toFixed(2)}deg`);
    }

    if (magnet) {
      element.style.setProperty('--tx', `${(offsetX * MAX_MAGNET).toFixed(2)}px`);
      element.style.setProperty('--ty', `${(offsetY * MAX_MAGNET).toFixed(2)}px`);
    }
  };

  const handleLeave = (event: PointerEvent<HTMLElement>) => {
    const element = event.currentTarget;

    hovered.current = false;
    element.style.setProperty('--rx', '0deg');
    element.style.setProperty('--ry', '0deg');
    element.style.setProperty('--tx', '0px');
    element.style.setProperty('--ty', '0px');
    element.style.removeProperty('--mx');
    element.style.removeProperty('--my');

    if (particles > 0) clearStars(element);
  };

  const handleDown = (event: PointerEvent<HTMLElement>) => {
    if (!ripple || !motion.current) return;

    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const dot = document.createElement('span');

    dot.className = 'bento-ripple';
    dot.style.left = `${event.clientX - rect.left}px`;
    dot.style.top = `${event.clientY - rect.top}px`;
    dot.setAttribute('aria-hidden', 'true');
    dot.addEventListener('animationend', () => dot.remove(), { once: true });

    element.appendChild(dot);
  };

  const shared = {
    'data-bento': '',
    className: cn('bento-card', TONE_CLASS[tone], href && 'block', className),
    onPointerEnter: handleEnter,
    onPointerMove: handleMove,
    onPointerLeave: handleLeave,
    onPointerDown: handleDown,
  };

  if (href) {
    return (
      <a href={href} {...shared}>
        {children}
      </a>
    );
  }

  return <div {...shared}>{children}</div>;
}

/**
 * The grid itself.
 *
 * A plain wrapper so every bento on the page shares one gap and one row rhythm;
 * the spans live on the cards, because only the page knows what it is laying out.
 */
export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-3', className)}>{children}</div>;
}

/**
 * Pointer tracking for a *list* of static bento cells.
 *
 * Converting thirteen reference cells into thirteen client components would ship
 * thirteen effects and thirteen listeners to do what one delegated listener does.
 * This wrapper finds the hovered `.bento-card` inside it and sets the same two
 * variables the per-card component sets, so markup stays server-rendered.
 */
export function BentoSurface({ children, className }: { children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;

    if (!element) return;

    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let current: HTMLElement | null = null;

    const handleMove = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== 'mouse' || reduce.matches || !fine.matches) return;

      const card = (event.target as Element | null)?.closest<HTMLElement>('.bento-card');

      if (!card || !element.contains(card)) return;

      current = card;

      const rect = card.getBoundingClientRect();

      card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    };

    const handleLeave = () => {
      current?.style.removeProperty('--mx');
      current?.style.removeProperty('--my');
      current = null;
    };

    element.addEventListener('pointermove', handleMove);
    element.addEventListener('pointerleave', handleLeave);

    return () => {
      element.removeEventListener('pointermove', handleMove);
      element.removeEventListener('pointerleave', handleLeave);
    };
  }, []);

  return (
    <div ref={host} className={className}>
      {children}
    </div>
  );
}
