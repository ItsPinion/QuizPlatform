import { CanvasField } from '@/components/cinema/canvas-field';

/**
 * The film.
 *
 * The foundation of the page. Three layers, each doing one job:
 *
 *   - **The video** — a full-bleed loop, cropped to the frame, at the two
 *     grades the design calls for (`brightness(0.7)`, `contrast(1.1)`).
 *   - **The GIF** — dust drifting in the dark, composited over the video with
 *     `mix-blend-mode: screen`, so its black reads as transparent and the motes
 *     float in front of the lights. It is not a fallback: it runs everywhere,
 *     always, which means the background is alive even when autoplay is
 *     refused, the codec is missing, or the visitor asked for reduced motion.
 *     One 217 kB image, and nothing needs re-encoding to add to it.
 *   - **The canvas** — a field of dust you can touch (`CanvasField`): the
 *     pointer is a lamp, a press sends a ring through it. It is the one part of
 *     the background that answers back.
 *   - **The overlays** — a vignette and a top/bottom gradient, so type can sit
 *     on the middle of the frame and stay legible.
 *
 * Three decisions worth knowing:
 *
 *   - **The poster is also the poster.** It is the exact first frame of the
 *     video, so the handover from still to motion is invisible, and it is what
 *     a visitor on a metered connection sees.
 *   - **`prefers-reduced-motion` stops the video** (hidden by CSS, before any
 *     script runs) **but not the GIF** — a GIF cannot be paused by a media
 *     query. It is motion, and refusing to honour the setting would be the
 *     wrong trade for a background; so under reduced motion the GIF is dropped
 *     too and the poster carries the page. It is `aria-hidden` either way.
 *   - **The video is decorative.** No controls, `aria-hidden`: it carries no
 *     information, so it is not in the accessibility tree at all.
 */
export function Film() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden bg-black bg-[url('/film/reading-room.jpg')] bg-cover bg-center"
    >
      <video
        className="h-full w-full object-cover brightness-[0.7] contrast-[1.1] motion-reduce:hidden"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/film/reading-room.jpg"
        tabIndex={-1}
      >
        {/* VP9 first: it is smaller and every browser that prefers it does not
            need the h264 at all. */}
        <source src="/film/reading-room.webm" type="video/webm" />
        <source src="/film/reading-room.mp4" type="video/mp4" />
      </video>

      {/* The dust. `screen` against the video's own black keeps the motes and
          drops the plate they were rendered on. */}
      <div className="pointer-events-none absolute inset-0 bg-[url('/film/reading-room.gif')] bg-cover bg-center opacity-70 mix-blend-screen motion-reduce:hidden" />

      {/* The interactive layer. Sits above the veils so the dust is never
          dimmed by the gradient that exists for the video's sake. */}
      <CanvasField />

      {/* The vignette: focus at the centre of the frame. */}
      <div className="cine-veil cine-veil-radial" />
      {/* The gradient: dark at the top under the nav, dark at the bottom under
          the footer, clear through the middle where the headline sits. */}
      <div className="cine-veil cine-veil-linear" />
    </div>
  );
}
