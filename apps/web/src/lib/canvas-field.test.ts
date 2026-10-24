import { describe, expect, it } from 'vitest';

import {
  FIELD,
  type Mote,
  type Ripple,
  moteCount,
  seedMotes,
  stepField,
  stepRipples,
} from './canvas-field';

const mote = (over: Partial<Mote> = {}): Mote => ({
  x: 100,
  y: 100,
  vx: 0,
  vy: 0,
  r: 1,
  a: 0.3,
  phase: 0,
  sway: 1,
  ...over,
});

const still = { x: 0, y: 0, active: false };

function run(motes: Mote[], frames: number, extra: Partial<Parameters<typeof stepField>[1]> = {}) {
  for (let i = 0; i < frames; i += 1) {
    stepField(motes, {
      dt: 0.016,
      time: i * 16,
      width: 400,
      height: 300,
      pointer: still,
      ripples: [],
      ...extra,
    });
  }
}

describe('moteCount', () => {
  it('scales with the area of the frame', () => {
    const small = moteCount(400, 300);
    const large = moteCount(1920, 1080);

    expect(large).toBeGreaterThan(small);
  });

  it('never drops below the floor, however small the frame', () => {
    expect(moteCount(10, 10)).toBe(FIELD.minMotes);
  });

  it('never exceeds the ceiling, however large the frame', () => {
    expect(moteCount(8000, 5000)).toBe(FIELD.maxMotes);
  });

  it('gives nothing for a frame with no size', () => {
    expect(moteCount(0, 800)).toBe(0);
    expect(moteCount(800, 0)).toBe(0);
    expect(moteCount(-10, 400)).toBe(0);
  });
});

describe('seedMotes', () => {
  it('starts every mote inside the frame', () => {
    const motes = seedMotes(800, 600);

    for (const m of motes) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThanOrEqual(800);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeLessThanOrEqual(600);
    }
  });

  it('gives motes different sizes, opacities and phases', () => {
    const motes = seedMotes(800, 600);

    expect(new Set(motes.map((m) => m.r)).size).toBeGreaterThan(1);
    expect(new Set(motes.map((m) => m.a)).size).toBeGreaterThan(1);
    expect(new Set(motes.map((m) => m.phase)).size).toBeGreaterThan(1);
  });

  it('is deterministic when given a fixed random', () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    const a = seedMotes(800, 600, random);

    seed = 1;
    const b = seedMotes(800, 600, random);

    expect(a).toEqual(b);
  });
});

describe('stepField', () => {
  it('moves a mote', () => {
    const motes = [mote({ vx: 10, vy: 5 })];
    const before = { ...motes[0]! };

    run(motes, 1);

    expect(motes[0]!.x).not.toBe(before.x);
    expect(motes[0]!.y).not.toBe(before.y);
  });

  it('wraps a mote that leaves the right edge back to the left', () => {
    // Past width + 8, which is the boundary the wrap uses — a mote drifting at
    // the speed limit would take seconds to get there on its own.
    const motes = [mote({ x: 409, y: 150, vx: 0, vy: 0 })];

    run(motes, 1);

    expect(motes[0]!.x).toBeLessThan(0);
  });

  it('carries a mote across the boundary at the speed limit and wraps it', () => {
    // At the clamp it advances ~1px per frame, so this takes a while — which is
    // the point: the boundary is not reachable in one step from the middle.
    const motes = [mote({ x: 399, y: 150, vx: 60, vy: 0 })];

    run(motes, 700);

    expect(motes[0]!.x).toBeGreaterThanOrEqual(-8);
    expect(motes[0]!.x).toBeLessThanOrEqual(408);
  });

  it('wraps in every direction', () => {
    const cases = [
      { x: -9, y: 100, vx: -600, vy: 0 },
      { x: 100, y: -9, vx: 0, vy: -600 },
      { x: 100, y: 309, vx: 0, vy: 600 },
    ];

    for (const start of cases) {
      const motes = [mote(start)];
      run(motes, 3);

      expect(motes[0]!.x).toBeGreaterThanOrEqual(-8);
      expect(motes[0]!.x).toBeLessThanOrEqual(408);
      expect(motes[0]!.y).toBeGreaterThanOrEqual(-8);
      expect(motes[0]!.y).toBeLessThanOrEqual(308);
    }
  });

  it('never lets a mote exceed the speed limit', () => {
    const motes = [mote({ vx: 5000, vy: 5000 })];

    run(motes, 10);

    expect(Math.hypot(motes[0]!.vx, motes[0]!.vy)).toBeLessThanOrEqual(FIELD.maxSpeed + 0.001);
  });

  it('pushes motes away from the pointer', () => {
    const motes = [mote({ x: 110, y: 100 })];
    const pointer = { x: 100, y: 100, active: true };

    run(motes, 6, { pointer });

    expect(motes[0]!.x).toBeGreaterThan(110);
  });

  it('does nothing at all when the pointer is out of reach', () => {
    const inside = [mote({ x: 110, y: 100 })];
    const outside = [mote({ x: 110, y: 100 })];

    run(inside, 6, { pointer: { x: 100, y: 100, active: true } });
    run(outside, 6, { pointer: { x: 100 + FIELD.lampRadius * 3, y: 100, active: true } });

    // The far mote is only subject to the sway, like an untouched one.
    const untouched = [mote({ x: 110, y: 100 })];
    run(untouched, 6);

    expect(outside[0]!.x - untouched[0]!.x).toBeLessThan(0.001);
    expect(inside[0]!.x - untouched[0]!.x).toBeGreaterThan(0);
  });

  it('ignores a pointer that is not active', () => {
    const motes = [mote({ x: 110, y: 100 })];

    run(motes, 6, { pointer: { x: 100, y: 100, active: false } });

    const untouched = [mote({ x: 110, y: 100 })];
    run(untouched, 6);

    expect(motes[0]!.x).toBeCloseTo(untouched[0]!.x, 6);
  });

  it('pushes a mote only while a ripple is passing over it', () => {
    const ripples: Ripple[] = [{ x: 100, y: 100, r: 60, life: 1 }];
    const over = [mote({ x: 165, y: 100 })];
    const beyond = [mote({ x: 400, y: 100 })];
    const clean = [mote({ x: 400, y: 100 })];

    run(over, 3, { ripples });
    run(beyond, 3, { ripples });
    run(clean, 3);

    expect(over[0]!.x).toBeGreaterThan(165);
    expect(beyond[0]!.x).toBeCloseTo(clean[0]!.x, 6);
  });

  it('clamps a step so a backgrounded tab does not replay minutes of physics', () => {
    const huge = [mote({ vx: 30 })];
    const clamped = [mote({ vx: 30 })];
    const normal = [mote({ vx: 30 })];

    run(huge, 1, { dt: 60 });
    run(clamped, 1, { dt: FIELD.maxStep });
    run(normal, 1, { dt: 0.016 });

    expect(huge[0]!.x).toBeCloseTo(clamped[0]!.x, 6);
    expect(clamped[0]!.x).not.toBeCloseTo(normal[0]!.x, 6);
  });

  it('treats a negative dt as no time passing', () => {
    const motes = [mote({ vx: 10 })];
    const before = { ...motes[0]! };

    run(motes, 1, { dt: -5 });

    expect(motes[0]!.x).toBeCloseTo(before.x, 6);
  });

  it('settles back to a slow drift once nothing is pushing it', () => {
    const motes = [mote({ x: 110, y: 100 })];

    run(motes, 8, { pointer: { x: 100, y: 100, active: true } });
    const speedAfterPush = Math.hypot(motes[0]!.vx, motes[0]!.vy);

    run(motes, 240);

    expect(Math.hypot(motes[0]!.vx, motes[0]!.vy)).toBeLessThan(speedAfterPush);
  });
});

describe('stepRipples', () => {
  it('expands and fades a ring', () => {
    const [next] = stepRipples([{ x: 0, y: 0, r: 10, life: 1 }], 0.1);

    expect(next!.r).toBeGreaterThan(10);
    expect(next!.life).toBeLessThan(1);
  });

  it('drops a ring once its life runs out', () => {
    expect(stepRipples([{ x: 0, y: 0, r: 10, life: 0.01 }], 1)).toHaveLength(0);
  });

  it('keeps a ring that is still alive', () => {
    expect(stepRipples([{ x: 0, y: 0, r: 10, life: 1 }], 0.1)).toHaveLength(1);
  });

  it('does not mutate the array it was given', () => {
    const ripples = [{ x: 0, y: 0, r: 10, life: 1 }];
    const next = stepRipples(ripples, 0.1);

    expect(next).not.toBe(ripples);
    expect(next[0]).not.toBe(ripples[0]);
  });
});
