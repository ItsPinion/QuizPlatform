import { cn } from '@/lib/utils';

/**
 * The first thing in the tab order.
 *
 * A keyboard user should not have to walk the whole navigation — twice, since
 * the header is sticky and the areas add a sidebar — before reaching the page
 * they asked for. Hidden until focused, then a real button-sized target.
 *
 * One component rather than four copies, so a new shell cannot quietly ship
 * without it.
 */
export function SkipLink({
  href = '#main',
  label = 'Skip to content',
  className,
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        'focus:bg-primary focus:text-primary-foreground focus:ring-primary-foreground/40',
        'sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100',
        'focus:rounded-lg focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold',
        'focus:shadow-lg focus:ring-[3px] focus:outline-none',
        className,
      )}
    >
      {label}
    </a>
  );
}
