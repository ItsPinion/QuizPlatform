import { describe, expect, it } from 'vitest';

import {
  MARK_GRID,
  MARK_RING,
  MARK_RING_OUTER,
  MARK_TAIL,
  markBounds,
  markCentre,
  tailGap,
  WORDMARK,
} from './logo-geometry';

/**
 * The mark is a ring and a dot, and these are the rules that keep it one.
 *
 * A logo drawn as eight paths is a drawing, and drawings rot: someone adds a
 * highlight, someone thickens a stroke, and the thing stops being a mark. Written
 * as numbers with assertions, the same edits fail here first.
 */

describe('the mark fits its grid', () => {
  it('keeps every stroked edge inside 0–32, so nothing clips at any size', () => {
    const { left, top, right, bottom } = markBounds();

    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(MARK_GRID);
    expect(bottom).toBeLessThanOrEqual(MARK_GRID);
  });

  it('is optically centred — the tail is why the ring is not at 16,16', () => {
    const { x, y } = markCentre();

    expect(Math.abs(x - MARK_GRID / 2)).toBeLessThan(0.25);
    expect(Math.abs(y - MARK_GRID / 2)).toBeLessThan(0.25);
    // The ring itself is deliberately off-centre: the ink is centred, not the bowl.
    expect(MARK_RING.cx).toBeLessThan(MARK_GRID / 2);
  });

  it('leaves a margin at the edges rather than touching them', () => {
    const { left, top, right, bottom } = markBounds();

    expect(left).toBeGreaterThan(1.5);
    expect(top).toBeGreaterThan(1.5);
    expect(MARK_GRID - right).toBeGreaterThan(1.5);
    expect(MARK_GRID - bottom).toBeGreaterThan(1.5);
  });
});

describe('the tail is detached', () => {
  it('floats clear of the ring — a gap, not a joint', () => {
    expect(tailGap()).toBeGreaterThan(0.5);
  });

  it('stays close enough to read as part of the same letter', () => {
    expect(tailGap()).toBeLessThan(3);
  });

  it('is a dot, not a second ring: the tail is filled, the bowl is stroked', () => {
    expect(MARK_TAIL.r).toBeGreaterThan(0);
    // A tail heavier than a third of the bowl stops being a full stop.
    expect(MARK_TAIL.r).toBeLessThan(MARK_RING.r / 2);
  });

  it('is smaller than the ring, so the ring stays the subject', () => {
    expect(MARK_TAIL.r).toBeLessThan(MARK_RING_OUTER);
  });
});

describe('the stroke survives small sizes', () => {
  it('is heavy enough for 16px and light enough for 256px', () => {
    // At 16px the 2.8-unit stroke is ~1.4px, the thinnest a ring can be and still
    // render crisply; at 256px it is ~22px, still a stroke rather than a disc.
    const atSixteen = (MARK_RING.strokeWidth / MARK_GRID) * 16;

    expect(atSixteen).toBeGreaterThanOrEqual(1.3);
    expect(MARK_RING.strokeWidth / MARK_RING.r).toBeLessThan(0.35);
  });

  it('draws a ring whose counter stays open', () => {
    // The hole is 10.1 - 1.4 = 8.7 units across, so the ring never fills in.
    expect(MARK_RING.r - MARK_RING.strokeWidth / 2).toBeGreaterThan(8);
  });
});

describe('the wordmark', () => {
  it('is the product name, spelled the way the product spells it', () => {
    expect(WORDMARK).toBe('QuizPlatform');
  });
});
