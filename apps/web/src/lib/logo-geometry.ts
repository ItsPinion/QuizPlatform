/**
 * The mark, as numbers.
 *
 * `components/brand/logo.tsx` draws a ring and a dot; this file says where they
 * are and why, so the three rules the mark depends on — it fits the grid, it is
 * optically centred, its tail is detached — can be asserted instead of eyeballed.
 *
 * Coordinates are on a 32-unit grid with the origin at the top left, which is the
 * same grid the favicon and every other piece of iconography in the app uses.
 */

/** The drawing's square: `viewBox="0 0 32 32"`. */
export const MARK_GRID = 32;

/**
 * The ring — the Q's bowl.
 *
 * Nudged up and left of centre (13.55, not 16) on purpose: the dot below-right
 * adds visual weight, and a mathematically centred bowl with an off-centre tail
 * reads as a mark that has slipped. The pair's ink, not the ring, is what sits on
 * the grid's centre.
 */
export const MARK_RING = { cx: 13.55, cy: 13.55, r: 10.1, strokeWidth: 2.8 } as const;

/**
 * The tail — detached, a dot rather than a stroke.
 *
 * A drawn tail (a diagonal bar) is what a font's `Q` has; a dot is what a logo
 * has. Detaching it also means the mark still reads at 16px, where a joined tail
 * would fill in to a blob, and it gives the ring a second meaning: a question,
 * then a full stop.
 */
export const MARK_TAIL = { cx: 25.9, cy: 25.9, r: 3.9 } as const;

/** The outer edge of the ring's stroke — where the ink actually stops. */
export const MARK_RING_OUTER = MARK_RING.r + MARK_RING.strokeWidth / 2;

/** The wordmark beside the mark. One word, one weight, no colour split. */
export const WORDMARK = 'QuizPlatform';

/** The ink's bounding box: the ring decides the top-left, the tail the bottom-right. */
export function markBounds() {
  return {
    left: MARK_RING.cx - MARK_RING_OUTER,
    top: MARK_RING.cy - MARK_RING_OUTER,
    right: MARK_TAIL.cx + MARK_TAIL.r,
    bottom: MARK_TAIL.cy + MARK_TAIL.r,
  };
}

/** How far the tail floats from the ring, in grid units. Negative would mean overlap. */
export function tailGap(): number {
  const distance = Math.hypot(MARK_TAIL.cx - MARK_RING.cx, MARK_TAIL.cy - MARK_RING.cy);

  return distance - (MARK_RING_OUTER + MARK_TAIL.r);
}

/** The exact centre of the ink, for checking optical centring. */
export function markCentre() {
  const { left, top, right, bottom } = markBounds();

  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}
