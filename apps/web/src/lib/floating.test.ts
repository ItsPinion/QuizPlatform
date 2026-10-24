import { describe, expect, it } from 'vitest';

import { placeList } from './floating';

/**
 * A dropdown that opens upward is a nicety; a dropdown that opens off the bottom
 * of the screen, or wider than the window, is a bug. These are the arithmetic
 * cases — the ones that are impossible to check by hand in a browser at every
 * window size.
 */

const viewport = { width: 1280, height: 800 };
const field = (
  over: Partial<{ top: number; left: number; width: number; height: number }> = {},
) => ({
  top: 200,
  left: 100,
  width: 240,
  height: 40,
  ...over,
});

describe('placeList', () => {
  it('opens below the field when there is room, flush with its left edge', () => {
    const at = placeList(field(), viewport);

    expect(at.side).toBe('below');
    expect(at.left).toBe(100);
    expect(at.top).toBe(246); // 200 + 40 + a 6px gap
    expect(at.width).toBe(240);
  });

  it('is always exactly as wide as the field', () => {
    expect(placeList(field({ width: 90 }), viewport).width).toBe(90);
    expect(placeList(field({ width: 610 }), viewport).width).toBe(610);
  });

  it('opens upward when the field sits near the bottom of the window', () => {
    const at = placeList(field({ top: 720 }), viewport);

    expect(at.side).toBe('above');
    expect(at.top).toBeLessThan(720);
    // The list's bottom edge is the gap above the field, not over it.
    expect(at.top + at.maxHeight).toBe(714);
  });

  it('never lets a tall list run off the bottom of the window', () => {
    const at = placeList(field({ top: 640 }), viewport);
    const bottom = at.top + at.maxHeight;

    expect(bottom).toBeLessThanOrEqual(viewport.height - 8);
  });

  it('shortens the list to the room it has when neither side is roomy', () => {
    // A short window: 300px tall, the field in the middle.
    const at = placeList(field({ top: 120 }), { width: 1280, height: 300 });

    expect(at.maxHeight).toBeLessThanOrEqual(300);
    expect(at.maxHeight).toBeGreaterThan(0);
  });

  it('keeps a field in the last column inside the window', () => {
    const at = placeList(field({ left: 1200, width: 240 }), viewport);

    expect(at.left).toBeGreaterThanOrEqual(8);
    expect(at.left + at.width).toBeLessThanOrEqual(viewport.width - 8);
  });

  it('narrows a field wider than the window instead of overflowing it', () => {
    const at = placeList(field({ left: 0, width: 2000 }), { width: 400, height: 800 });

    expect(at.width).toBe(400 - 16);
    expect(at.left).toBe(8);
  });

  it('survives a window shorter than the gap it wants', () => {
    const at = placeList(field({ top: 10 }), { width: 400, height: 30 });

    expect(at.maxHeight).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(at.top)).toBe(true);
  });

  it('prefers below on a tie, because downward is what people expect', () => {
    // Field centred in a window where both sides have identical room.
    const at = placeList(field({ top: 377, height: 40 }), { width: 1280, height: 800 });

    expect(at.side).toBe('below');
  });

  it('opens at its preferred height when there is plenty of room', () => {
    expect(placeList(field(), viewport, { preferredHeight: 200 }).maxHeight).toBe(200);
  });
});
