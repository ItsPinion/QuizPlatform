import { CanvasField } from '@/components/cinema/canvas-field';

/**
 * The room behind a console.
 *
 * A dashboard cannot run the landing page's film: it is a working surface,
 * scrolled and read for minutes at a time, and a six-second loop under a table
 * of numbers is both noise and battery. But it can be the *same room* — the
 * film's own frame, held still and pushed far back, with the same dust drifting
 * over it and the same field you can touch.
 *
 * Five layers, each doing one job:
 *
 *   - **The room** — the film's first frame, the exact poster of
 *     `reading-room`, at 20% over black. It is the texture that makes the page
 *     feel like a place rather than a spreadsheet, and it costs one image the
 *     landing page has already fetched.
 *   - **The dust** — the same GIF, screen-blended so its black reads as
 *     transparent. Dropped under `prefers-reduced-motion`, like everywhere else
 *     in the product: a GIF cannot be paused by a media query, so it is removed.
 *   - **The light** — two soft blooms and a grid faint enough to read as
 *     texture, so the top of the page is lit and the rest falls away.
 *   - **The veil** — enough to read a table over a photograph, not enough to
 *     erase it. Darkest at the bottom, where long lists live.
 *   - **The canvas** — `CanvasField`, the interactive layer: the pointer is a
 *     lamp, a press sends a ring out through the dust. Identical physics to the
 *     landing page, at the same cost (one canvas, off-screen and hidden-tab
 *     aware, a static frame under reduced motion).
 *
 * Everything is decorative and inert: `aria-hidden`, `pointer-events-none`, and
 * a fixed layer behind the content. The console's shell opens a stacking
 * context (`relative isolate`) so this `-z-10` layer paints above the page
 * background instead of disappearing behind it.
 */
export function Ambience() {
  return (
    <div
      aria-hidden
      data-theme-layer
      className="screen-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black"
    >
      {/* The room. Held still: the film without the film. */}
      <div className="backdrop-photo absolute inset-0 bg-[url('/film/reading-room.jpg')] bg-cover bg-center opacity-20" />

      {/* The dust, the same one the landing page drifts. */}
      <div className="backdrop-dust absolute inset-0 bg-[url('/film/reading-room.gif')] bg-cover bg-center opacity-40 mix-blend-screen motion-reduce:hidden" />

      {/* The bloom, centred above the content. */}
      <div className="backdrop-bloom absolute -top-[22rem] left-1/2 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.09),transparent)] blur-3xl" />
      {/* A second, weaker bloom on the right, so the light is not perfectly symmetrical. */}
      <div className="backdrop-bloom absolute -top-40 -right-40 h-[28rem] w-[40rem] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.045),transparent)] blur-3xl" />

      {/* Texture. */}
      <div className="bg-grid absolute inset-x-0 top-0 h-[520px] opacity-[0.05]" />

      {/* The veil: darkest at the bottom, where long lists live. */}
      <div className="backdrop-veil absolute inset-0 bg-gradient-to-b from-black/50 via-black/78 to-black/92" />

      {/* The one part of the background that answers back. Above the veil for the
          same reason as on the landing page: the dust must not be dimmed by the
          gradient that exists for the photograph's sake. */}
      <div className="backdrop-canvas absolute inset-0">
        <CanvasField />
      </div>
    </div>
  );
}
