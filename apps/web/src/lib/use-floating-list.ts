'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { placeList, type ListPlacement } from './floating';

/**
 * Keep a portalled dropdown glued to the field that owns it.
 *
 * The placement itself is arithmetic and lives in `floating.ts`. This is the
 * browser half: measure the trigger, re-measure when the page scrolls or the
 * window resizes, and hand back a `fixed` rectangle for the list.
 *
 * `scroll` is listened to in the capture phase so a scroll inside any ancestor —
 * a table with `overflow-x-auto`, a card, the window — moves the list with the
 * field instead of leaving it behind.
 *
 * The measurement happens in a layout effect so the list is positioned in the
 * same frame it appears; there is no frame where it sits at 0,0.
 */
export function useFloatingList<T extends HTMLElement>(
  open: boolean,
  preferredHeight = 320,
): { triggerRef: React.RefObject<T | null>; placement: ListPlacement | null } {
  const triggerRef = useRef<T | null>(null);
  const [placement, setPlacement] = useState<ListPlacement | null>(null);

  const measure = useCallback(() => {
    const element = triggerRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();

    setPlacement(
      placeList(
        { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
        { preferredHeight },
      ),
    );
  }, [preferredHeight]);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;

    const onMove = () => measure();

    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);

    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, measure]);

  return { triggerRef, placement };
}
