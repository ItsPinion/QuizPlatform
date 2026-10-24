/**
 * Where a dropdown goes.
 *
 * A popup drawn inside the card that owns the field inherits the card's stacking
 * context, which is how a list ends up under the next card down the page — the
 * card is a glass surface with a `backdrop-filter`, and that is enough for the
 * browser to paint it as its own layer. `z-50` inside it means "above my
 * siblings", not "above the page".
 *
 * The fix is to portal the list to `document.body` and place it with `position:
 * fixed`. Then nothing above it matters. What is left is arithmetic: where does
 * the box go, how tall may it be, and does it open upward when the field is near
 * the bottom of the window? That arithmetic is this file — pure, viewport-shaped,
 * and tested without a browser.
 */

/** The part of `DOMRect` the placement needs. */
export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface ListPlacement {
  left: number;
  top: number;
  /** Always the field's width: a dropdown wider than its field looks detached. */
  width: number;
  maxHeight: number;
  side: 'below' | 'above';
}

/** Space to leave between the field and the edge of the window. */
const MARGIN = 8;

/**
 * Place the list.
 *
 * - Opens below the field by default, and above it when there is more room there.
 * - Never leaves the window horizontally: `left` is clamped, so a field in the
 *   last column still opens a full-width list.
 * - `maxHeight` is whatever room the chosen side actually has, capped at the
 *   preferred height — the list scrolls inside that, so it never runs off the
 *   bottom of the screen.
 */
export function placeList(
  anchor: AnchorRect,
  viewport: Viewport,
  { preferredHeight = 320, gap = 6 }: { preferredHeight?: number; gap?: number } = {},
): ListPlacement {
  const width = Math.max(0, Math.min(anchor.width, viewport.width - MARGIN * 2));
  const maxLeft = Math.max(MARGIN, viewport.width - width - MARGIN);
  const left = Math.min(Math.max(anchor.left, MARGIN), maxLeft);

  const below = Math.max(0, viewport.height - (anchor.top + anchor.height) - gap - MARGIN);
  const above = Math.max(0, anchor.top - gap - MARGIN);

  // Below wins ties: a list that opens downward is what people expect, and it
  // keeps the field's label readable above it.
  const side: 'below' | 'above' = below >= preferredHeight || below >= above ? 'below' : 'above';
  const room = side === 'below' ? below : above;
  const maxHeight = Math.max(0, Math.min(preferredHeight, room));

  return {
    left,
    top: side === 'below' ? anchor.top + anchor.height + gap : anchor.top - gap - maxHeight,
    width,
    maxHeight,
    side,
  };
}
