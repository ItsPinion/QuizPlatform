'use client';

import { useEffect, useRef } from 'react';

import {
  FIELD,
  type Mote,
  type Ripple,
  seedMotes,
  stepField,
  stepRipples,
} from '@/lib/canvas-field';

/**
 * The canvas.
 *
 * A field of dust drawn at 60fps over the film, and the one part of the
 * background you can touch:
 *
 *   - the pointer is a **lamp**. Motes within reach brighten, lean in, and link
 *     to their neighbours with faint threads — the only lines on the page, and
 *     they only exist where you are.
 *   - a **click or tap** sends a ring out through the field, pushing motes
 *     aside as it passes and settling again behind it.
 *   - the field **breathes** on its own when nothing is happening, so the
 *     background is never a still image waiting for input.
 *
 * Everything below is about not being a nuisance:
 *
 *   - **Reduced motion**: one static frame is drawn, no loop is started, and
 *     the pointer is ignored. A preference is not a suggestion.
 *   - **Hidden tab or scrolled past**: the loop stops on `visibilitychange`
 *     and on leaving the viewport, so a background never burns a battery in a
 *     tab nobody is looking at.
 *   - **Retina, bounded**: the backing store is scaled by `devicePixelRatio`
 *     up to 2× — beyond that the extra pixels cost real time for detail no one
 *     can see.
 *   - **Density, not a count**: mote count follows the area of the frame, so a
 *     phone and a 27-inch display both look deliberate.
 *   - **Decorative**: `aria-hidden`, `pointer-events: none`. It listens on the
 *     window, so it never swallows a click meant for the page.
 */

export function CanvasField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    let width = 0;
    let height = 0;
    let dpr = 1;
    let motes: Mote[] = [];
    let ripples: Ripple[] = [];
    let frame = 0;
    let last = 0;
    let visible = false;
    let running = false;

    // The pointer, in CSS pixels. `active` is false until it has moved once, so
    // a page that has never been touched draws no lamp.
    const pointer = { x: 0, y: 0, active: false };

    /* ------------------------------- sizing ------------------------------- */

    function seed() {
      motes = seedMotes(width, height);
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);

      seed();

      // Nothing is running under reduced motion: the static frame has to be
      // redrawn by hand at the new size.
      if (reduced.matches) draw();
    }

    /* -------------------------------- input ------------------------------- */

    function toLocal(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function onPointerMove(event: PointerEvent) {
      const point = toLocal(event);

      // Only claim the pointer while it is over the frame.
      if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) {
        pointer.active = false;
        return;
      }

      pointer.x = point.x;
      pointer.y = point.y;
      pointer.active = true;
    }

    function onPointerLeave() {
      pointer.active = false;
    }

    function onPointerDown(event: PointerEvent) {
      const point = toLocal(event);
      if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) return;
      if (reduced.matches) return;

      // Three rings, slightly apart, so a press reads as a splash rather than
      // a single expanding circle.
      for (let i = 0; i < 3; i += 1) {
        ripples.push({ x: point.x, y: point.y, r: i * 14, life: 1 });
      }
    }

    /* -------------------------------- frame ------------------------------- */

    /** The physics lives in `lib/canvas-field.ts`, where it is tested. */
    function step(dt: number, time: number) {
      stepField(motes, { dt, time, width, height, pointer, ripples });
      ripples = stepRipples(ripples, dt);
    }

    function draw() {
      context!.clearRect(0, 0, width, height);

      /* The threads, only near the lamp. */
      if (pointer.active) {
        for (let i = 0; i < motes.length; i += 1) {
          const a = motes[i]!;
          if (Math.hypot(a.x - pointer.x, a.y - pointer.y) > FIELD.threadRadius) continue;

          for (let j = i + 1; j < motes.length; j += 1) {
            const b = motes[j]!;
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (distance > FIELD.threadDistance) continue;

            const reach = 1 - Math.hypot(a.x - pointer.x, a.y - pointer.y) / FIELD.threadRadius;
            const alpha = (1 - distance / FIELD.threadDistance) * Math.max(0, reach) * 0.22;

            if (alpha < 0.012) continue;

            context!.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            context!.lineWidth = 0.7;
            context!.beginPath();
            context!.moveTo(a.x, a.y);
            context!.lineTo(b.x, b.y);
            context!.stroke();
          }
        }
      }

      /* The motes. */
      for (const mote of motes) {
        let alpha = mote.a;

        if (pointer.active) {
          const distance = Math.hypot(mote.x - pointer.x, mote.y - pointer.y);
          if (distance < FIELD.lampRadius) {
            alpha += (1 - distance / FIELD.lampRadius) * 0.5;
          }
        }

        // A halo only where it is bright: a lamp, not a uniform glow.
        if (alpha > 0.42) {
          const glow = context!.createRadialGradient(mote.x, mote.y, 0, mote.x, mote.y, mote.r * 6);
          glow.addColorStop(0, `rgba(255, 255, 255, ${Math.min(alpha * 0.5, 0.4)})`);
          glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
          context!.fillStyle = glow;
          context!.beginPath();
          context!.arc(mote.x, mote.y, mote.r * 6, 0, Math.PI * 2);
          context!.fill();
        }

        context!.fillStyle = `rgba(255, 255, 255, ${Math.min(alpha, 0.95)})`;
        context!.beginPath();
        context!.arc(mote.x, mote.y, mote.r, 0, Math.PI * 2);
        context!.fill();
      }

      /* The rings from a press. */
      for (const ripple of ripples) {
        context!.strokeStyle = `rgba(255, 255, 255, ${ripple.life * 0.16})`;
        context!.lineWidth = 1;
        context!.beginPath();
        context!.arc(ripple.x, ripple.y, Math.max(ripple.r, 0.5), 0, Math.PI * 2);
        context!.stroke();
      }
    }

    function loop(time: number) {
      if (!running) return;

      // Clamped: a tab that was backgrounded for a minute must not replay a
      // minute of physics in one step.
      const dt = last === 0 ? 0.016 : Math.min((time - last) / 1000, 0.05);
      last = time;

      step(dt, time);
      draw();

      frame = window.requestAnimationFrame(loop);
    }

    function start() {
      if (running || reduced.matches) return;
      running = true;
      last = 0;
      frame = window.requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      last = 0;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    }

    function syncPlayback() {
      if (visible && !document.hidden) start();
      else stop();
    }

    /* ------------------------------ lifecycle ----------------------------- */

    const observer = new ResizeObserver(() => {
      resize();
    });
    observer.observe(canvas);

    // Only run while the frame is actually on screen.
    const inView = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        syncPlayback();
      },
      { threshold: 0 },
    );
    inView.observe(canvas);

    const onVisibility = () => syncPlayback();
    const onMotionChange = () => {
      if (reduced.matches) {
        stop();
        pointer.active = false;
        ripples = [];
        draw();
      } else {
        syncPlayback();
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    reduced.addEventListener('change', onMotionChange);

    resize();

    return () => {
      stop();
      observer.disconnect();
      inView.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-canvas-field
      // Above the film's overlays: the motes are the brightest thing in the
      // frame and they must not be dimmed by the veil meant for the video.
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    />
  );
}
