import { CanvasField } from '@/components/cinema/canvas-field';

/**
 * The room behind the auth screens.
 *
 * The landing page opens on a film of a reading room; a sign-in form that opened
 * on a flat black rectangle would look like a different product. So this is the
 * same room, held still: the film's own poster at the grade the hero uses, the
 * same dust drifting over it, the same vignette, and the same interactive canvas
 * you can push a ring through.
 *
 * Not the video, and not by accident. A form is a place people sit for twenty
 * seconds with the keyboard focused; a six-second loop underneath it is battery
 * for nothing. The still plus the dust carries the material, and the absence of
 * motion is what keeps the page feeling *quiet* rather than alive.
 *
 * Decorative and inert: `aria-hidden`, `pointer-events-none`, and under
 * `prefers-reduced-motion` the GIF goes too — a GIF cannot be paused by a media
 * query, so it is removed rather than left running.
 */
export function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black">
      {/* The frame: the film's first frame, graded like the film itself. */}
      <div className="absolute inset-0 bg-[url('/film/reading-room.jpg')] bg-cover bg-center brightness-[0.62] contrast-[1.08] saturate-[0.9]" />

      {/* The dust. Screen-blended, so its black plate disappears. */}
      <div className="absolute inset-0 bg-[url('/film/reading-room.gif')] bg-cover bg-center opacity-50 mix-blend-screen motion-reduce:hidden" />

      {/* The light: the lamp from the landing page, high and to the right. */}
      <div className="absolute -top-56 right-1/4 h-[34rem] w-[46rem] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.10),transparent)] blur-3xl" />
      <div className="absolute -top-24 -left-32 h-[26rem] w-[36rem] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.05),transparent)] blur-3xl" />

      {/* The vignette and the gradient: focus in the middle, dark at the edges,
          so the glass card sits on a lit part of the room. */}
      <div className="cine-veil cine-veil-radial" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/35 to-black/85" />

      {/* The part that answers back. */}
      <CanvasField />
    </div>
  );
}
