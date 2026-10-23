'use client';

import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Bento primitives.
 *
 * The effect is the same idea as the MagicBento reference — a light that follows
 * the pointer, a border that picks it up, a few degrees of tilt — implemented
 * with CSS custom properties instead of GSAP:
 *
 *   • no runtime dependency and nothing in the bundle beyond this file;
 *   • every animated property is a CSS variable, so the compositor does the work
 *     and React never re-renders on pointer move;
 *   • motion is opt-in twice: only for a fine pointer (not touch), and never
 *     when the visitor asked for reduced motion.
 *
 * Deliberately **not** ported: particle stars (visual noise on content cards,
 * and one animation frame loop per hover), magnetism (it moves targets away from
 * the cursor — bad for links) and click ripples on every card. A ripple is kept
 * for the "press" feedback on link cards only, driven by a CSS animation.
 */

export type BentoTone = 'primary' | 'sky' | 'success' | 'warning';

/** Glow colour per card, set as a CSS variable the pseudo-elements read. */
const TONE_CLASS: Record<BentoTone, string> = {
  primary: '[--bento-glow:var(--primary)]',
  sky: '[--bento-glow:oklch(0.74_0.13_215)]',
  success: '[--bento-glow:var(--success)]',
  warning: '[--bento-glow:var(--warning)]',
};

/** Maximum rotation in either axis — enough to feel alive, not enough to blur text. */
const MAX_TILT = 3.2;

interface BentoCardProps {
  children: ReactNode;
  tone?: BentoTone;
  href?: string;
  /** Tilt and follow the pointer. Off for dense or text-heavy cards. */
  interactive?: boolean;
  /** Ripple from the point that was pressed. Only meaningful on a link. */
  ripple?: boolean;
  className?: string;
}

export function BentoCard({
  children,
  tone = 'primary',
  href,
  interactive = true,
  ripple = false,
  className,
}: BentoCardProps) {
  const motion = useRef(true);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      motion.current = !query.matches;
    };

    sync();
    query.addEventListener('change', sync);

    return () => query.removeEventListener('change', sync);
  }, []);

  const handleMove = (event: PointerEvent<HTMLElement>) => {
    // A mouse, not a finger: on touch the light would stick where the tap landed.
    if (event.pointerType !== 'mouse') return;

    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    element.style.setProperty('--mx', `${x}px`);
    element.style.setProperty('--my', `${y}px`);

    if (!interactive || !motion.current) return;

    const offsetX = (x - rect.width / 2) / (rect.width / 2);
    const offsetY = (y - rect.height / 2) / (rect.height / 2);

    element.style.setProperty('--rx', `${(-offsetY * MAX_TILT).toFixed(2)}deg`);
    element.style.setProperty('--ry', `${(offsetX * MAX_TILT).toFixed(2)}deg`);
  };

  const handleLeave = (event: PointerEvent<HTMLElement>) => {
    const element = event.currentTarget;

    element.style.setProperty('--rx', '0deg');
    element.style.setProperty('--ry', '0deg');
    element.style.removeProperty('--mx');
    element.style.removeProperty('--my');
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
