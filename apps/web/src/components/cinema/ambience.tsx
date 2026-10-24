/**
 * The room behind a console.
 *
 * The landing page has a film; a dashboard cannot — it is a working surface,
 * scrolled and read, and a video under a table of numbers is noise. This is the
 * same room with the light on low: one soft bloom above the fold, and a grid so
 * faint it only registers as texture.
 *
 * Decorative and inert: `aria-hidden`, `pointer-events-none`, and a fixed layer
 * behind everything, so it never intercepts a click or shifts a layout.
 */
export function Ambience() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black">
      {/* The bloom, centred above the content. */}
      <div className="absolute -top-[22rem] left-1/2 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.09),transparent)] blur-3xl" />
      {/* A second, weaker bloom on the right, so the light is not perfectly symmetrical. */}
      <div className="absolute -top-40 -right-40 h-[28rem] w-[40rem] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.045),transparent)] blur-3xl" />
      {/* Texture. */}
      <div className="bg-grid absolute inset-x-0 top-0 h-[520px] opacity-[0.05]" />
    </div>
  );
}
