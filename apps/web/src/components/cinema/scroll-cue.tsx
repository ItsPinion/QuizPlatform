/**
 * The scroll indicator: a 48px thread of light falling into the page, with a
 * label you can read and a link you can actually use.
 *
 * The line is the decoration; the anchor is the control. Keyboard users get a
 * real target, and it is the first thing after the hero in the tab order.
 */
export function ScrollCue({
  href = '#platform',
  label = 'Scroll',
}: {
  href?: string;
  label?: string;
}) {
  return (
    <a
      href={href}
      className="group absolute bottom-[104px] left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-3 outline-none lg:bottom-[92px]"
    >
      <span className="cine-label text-[9px] text-white/45 transition-colors group-hover:text-white/80">
        {label}
      </span>
      <span aria-hidden className="relative block h-12 w-px overflow-hidden">
        <span className="cine-thread absolute inset-0 opacity-50 motion-safe:animate-bounce" />
      </span>
      <span className="sr-only">{label.toLowerCase()}</span>
    </a>
  );
}
