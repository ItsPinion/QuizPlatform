import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] font-medium tracking-[0.06em] whitespace-nowrap backdrop-blur-sm transition-colors [&>svg]:size-3',
  {
    variants: {
      variant: {
        // The console's own badges are glass: a faint pane, a hairline, white
        // type. Colour is kept for meaning only — a status, a pass, a failure —
        // never as decoration.
        default: 'border-white/15 bg-white/8 text-white',
        secondary: 'border-white/10 bg-white/6 text-gray-100',
        outline: 'border-white/12 text-gray-400',
        success: 'border-success/30 bg-success/10 text-success',
        warning: 'border-warning/30 bg-warning/10 text-warning',
        destructive: 'border-destructive/35 bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
