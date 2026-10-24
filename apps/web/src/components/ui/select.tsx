import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A select that belongs to this product.
 *
 * It is still a native `<select>` — the right element for the job. A phone
 * throws the platform's own picker on it, `type="search"`-style typing works,
 * `name` submits with the form, and a screen reader announces it as a combobox
 * with no scripting. What was wrong was the *paint*: a white popup with black
 * type over a black page, and a 6px shadcn box around it.
 *
 * So three things change and nothing else:
 *
 *   - `appearance-none` removes the OS chrome, and a chevron is drawn in its
 *     place a fixed distance from the right edge — inside the control, so it
 *     cannot be mis-clicked and does not shift the text.
 *   - `color-scheme: dark` is set on the element. That is the one line that
 *     reaches the *popup*: Chrome and Safari paint the option list in the
 *     control's colour scheme, which is why it was white. The option colours
 *     below (`globals.css`) cover Firefox, which paints them itself.
 *   - the glass field, the same one `Input` uses, so a form reads as one row.
 */
function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <span className="relative block">
      <select
        data-slot="select"
        className={cn(
          'h-10 w-full appearance-none rounded-lg border border-white/12 bg-white/[0.04] py-0 pr-9 pl-3',
          'text-[13px] text-white [color-scheme:dark] transition-colors outline-none',
          'hover:border-white/20',
          'focus-visible:border-white/30 focus-visible:ring-2 focus-visible:ring-white/15',
          'aria-invalid:border-destructive/70 aria-invalid:ring-destructive/25 aria-invalid:ring-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'cursor-pointer',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-gray-400"
      />
    </span>
  );
}

export { Select };
