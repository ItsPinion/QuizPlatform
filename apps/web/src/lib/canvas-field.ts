/**
 * The dust field's simulation.
 *
 * Kept out of the component for the same reason the nav's "is this link
 * active?" rule is: it is the part that can be wrong in a way nobody notices
 * for weeks — motes escaping the frame, the field accelerating forever, a tab
 * left open for an hour — and it is far easier to prove with a table of cases
 * than by watching it.
 *
 * Nothing here touches the DOM, the clock or `Math.random` (the caller supplies
 * `random`), so every function is deterministic given its inputs.
 */

export type Mote = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Base opacity, before the lamp and the ripples raise it. */
  a: number;
  phase: number;
  sway: number;
};

export type Ripple = { x: number; y: number; r: number; life: number };

export type Pointer = { x: number; y: number; active: boolean };

/** Tuning, in one place so the tests and the component cannot drift apart. */
export const FIELD = {
  /** One mote per this many square CSS pixels. */
  density: 11_000,
  minMotes: 28,
  maxMotes: 150,

  /** How far the pointer's lamp reaches, and how hard it pushes. */
  lampRadius: 170,
  lampPush: 26,

  /** Threads are only drawn this close together, and only this near the lamp. */
  threadDistance: 78,
  threadRadius: 210,

  /** A press: how fast the ring expands, how long it lives, how hard it pushes. */
  rippleSpeed: 420,
  rippleLife: 1.5,
  ripplePush: 150,
  rippleBand: 26,

  /** Drift. */
  swayForce: 2.2,
  damping: 0.985,
  maxSpeed: 60,

  /** No single frame is allowed to be longer than this (a backgrounded tab). */
  maxStep: 0.05,
} as const;

/**
 * How many motes a frame of this size gets.
 *
 * Density rather than a constant, so a phone is not crowded and a 27-inch
 * display is not sparse — and clamped so neither end of that range is absurd.
 */
export function moteCount(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0;

  return Math.round(
    Math.min(FIELD.maxMotes, Math.max(FIELD.minMotes, (width * height) / FIELD.density)),
  );
}

/** Scatter motes across the frame, each with its own drift and sway. */
export function seedMotes(
  width: number,
  height: number,
  random: () => number = Math.random,
): Mote[] {
  const count = moteCount(width, height);

  return Array.from({ length: count }, () => {
    const angle = random() * Math.PI * 2;
    const speed = 3 + random() * 9;

    return {
      x: random() * width,
      y: random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 0.6 + random() * 1.5,
      a: 0.1 + random() * 0.42,
      phase: random() * Math.PI * 2,
      sway: random() * 0.8 + 0.2,
    };
  });
}

/**
 * Advance the field by `dt` seconds.
 *
 * Order per mote is deliberate: drift, then the lamp, then any passing ripple,
 * then damping, then a speed clamp, then integrate. Damping after the pushes is
 * what stops a cursor held still against the field from winding it up.
 *
 * `time` is milliseconds from `requestAnimationFrame`, used only for the sway.
 */
export function stepField(
  motes: Mote[],
  {
    dt,
    time,
    width,
    height,
    pointer,
    ripples,
  }: {
    dt: number;
    time: number;
    width: number;
    height: number;
    pointer: Pointer;
    ripples: Ripple[];
  },
): void {
  const step = Math.min(Math.max(dt, 0), FIELD.maxStep);
  const seconds = time / 1000;

  for (const mote of motes) {
    mote.vx += Math.cos(seconds * 0.35 * mote.sway + mote.phase) * FIELD.swayForce * step;
    mote.vy += Math.sin(seconds * 0.29 * mote.sway + mote.phase) * FIELD.swayForce * step;

    if (pointer.active) {
      const dx = mote.x - pointer.x;
      const dy = mote.y - pointer.y;
      const distance = Math.hypot(dx, dy);

      if (distance < FIELD.lampRadius && distance > 0.5) {
        // Falls off with the square of the distance: strong at the cursor,
        // nothing at the edge of reach.
        const force = (1 - distance / FIELD.lampRadius) ** 2 * FIELD.lampPush * step;
        mote.vx += (dx / distance) * force;
        mote.vy += (dy / distance) * force;
      }
    }

    for (const ripple of ripples) {
      const dx = mote.x - ripple.x;
      const dy = mote.y - ripple.y;
      const distance = Math.hypot(dx, dy);

      // The ring only pushes the motes it is currently passing over.
      if (
        distance > ripple.r - FIELD.rippleBand &&
        distance < ripple.r + FIELD.rippleBand &&
        distance > 0.5
      ) {
        const force = FIELD.ripplePush * ripple.life * step;
        mote.vx += (dx / distance) * force;
        mote.vy += (dy / distance) * force;
      }
    }

    mote.vx *= FIELD.damping;
    mote.vy *= FIELD.damping;

    const speed = Math.hypot(mote.vx, mote.vy);
    if (speed > FIELD.maxSpeed) {
      mote.vx = (mote.vx / speed) * FIELD.maxSpeed;
      mote.vy = (mote.vy / speed) * FIELD.maxSpeed;
    }

    mote.x += mote.vx * step;
    mote.y += mote.vy * step;

    // Wrap rather than bounce: a mote leaving one edge reappears on the other,
    // so the field never thins out and there is nothing to see at the border.
    if (mote.x < -8) mote.x = width + 8;
    if (mote.x > width + 8) mote.x = -8;
    if (mote.y < -8) mote.y = height + 8;
    if (mote.y > height + 8) mote.y = -8;
  }
}

/**
 * Expand the rings, fade them, drop the dead ones.
 *
 * Returns new objects rather than ageing the given ones: the caller holds the
 * previous frame's array until it reassigns it, and mutating through two
 * references to the same ring would advance it twice per frame.
 */
export function stepRipples(ripples: Ripple[], dt: number): Ripple[] {
  const step = Math.min(Math.max(dt, 0), FIELD.maxStep);
  const next: Ripple[] = [];

  for (const ripple of ripples) {
    const aged = {
      x: ripple.x,
      y: ripple.y,
      r: ripple.r + FIELD.rippleSpeed * step,
      life: ripple.life - step / FIELD.rippleLife,
    };

    if (aged.life > 0) next.push(aged);
  }

  return next;
}
