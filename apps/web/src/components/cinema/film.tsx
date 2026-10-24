/**
 * The film.
 *
 * The foundation of the page: a full-bleed loop, cropped to the frame, with the
 * two overlays the type sits on. Nothing here is fetched from a CDN — the clip
 * is rendered by `scripts/make-film.ts` and served from `/film`.
 *
 * Three decisions worth knowing:
 *
 *   - **The poster is also the poster.** It is the exact first frame of the
 *     video, so the handover from still to motion is invisible, and it is what
 *     a visitor on a metered connection, or with motion turned off, sees.
 *   - **`prefers-reduced-motion` does not play the video at all.** It is hidden
 *     by CSS rather than skipped in JS, so the poster is already underneath
 *     before a byte of script runs.
 *   - **The video is decorative.** `aria-hidden` and no controls: it carries no
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

      {/* The vignette: focus at the centre of the frame. */}
      <div className="cine-veil cine-veil-radial" />
      {/* The gradient: dark at the top under the nav, dark at the bottom under
          the footer, clear through the middle where the headline sits. */}
      <div className="cine-veil cine-veil-linear" />
    </div>
  );
}
