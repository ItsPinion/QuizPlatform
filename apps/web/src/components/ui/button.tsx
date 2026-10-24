import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-white text-black shadow-[0_10px_30px_-16px] shadow-white/40 hover:bg-white/90',
        secondary: 'border border-white/10 bg-white/6 text-white hover:bg-white/10',
        outline:
          'border border-white/20 bg-transparent text-white hover:border-white/45 hover:bg-white/6',
        ghost: 'text-gray-300 hover:bg-white/6 hover:text-white',
        link: 'text-white underline-offset-4 hover:underline',
        /**
         * The landing page's call to action, in the auth forms.
         *
         * A white pill, uppercase, tracked out, with a grey panel that slides up
         * from below on hover (`.cine-slide__fill`) and a 1.05 scale — the same
         * button the hero uses, so arriving at `/login` from the hero does not
         * feel like changing products.
         */
        cta:
          'cine-slide rounded-full bg-white font-semibold tracking-[0.14em] text-black uppercase ' +
          'shadow-[0_20px_60px_-30px_rgba(255,255,255,0.55)] hover:text-black',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        xl: 'h-14 gap-2.5 rounded-xl px-8 text-base font-semibold has-[>svg]:px-6 [&_svg]:size-[18px]',
        icon: 'size-9',
        cta: 'h-14 gap-3 rounded-full px-8 text-[13px] [&_svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  const cta = variant === 'cta';

  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {/* The sliding panel lives behind the label, so it needs no z-index on
          the children beyond isolating the button itself. */}
      {cta ? <span className="cine-slide__fill" aria-hidden /> : null}
      {cta ? (
        <span className="relative z-10 inline-flex items-center gap-3">{children}</span>
      ) : (
        children
      )}
    </button>
  );
}

export { Button, buttonVariants };
