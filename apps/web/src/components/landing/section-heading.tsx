import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
}

/**
 * The heading for everything below the hero.
 *
 * Set in the same two voices as the first screen — an uppercase label at 20em,
 * then a display headline — so the page reads as one design from the film down
 * to the footer. The rule above the label replaces the old glowing gradient: on
 * a black-and-white page a hairline is louder than a glow.
 */
export function SectionHeading({ eyebrow, title, description, className }: SectionHeadingProps) {
  return (
    <div className={cn('max-w-2xl', className)}>
      <div className="flex items-center gap-4">
        <span aria-hidden className="h-px w-8 bg-white/25" />
        <span className="cine-label text-[10px] text-gray-400">{eyebrow}</span>
      </div>
      <h2 className="font-display mt-5 text-3xl leading-[1.05] font-light tracking-tight text-balance text-white sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 max-w-xl text-sm leading-relaxed font-light text-gray-400 sm:text-[15px]">
          {description}
        </p>
      ) : null}
    </div>
  );
}
