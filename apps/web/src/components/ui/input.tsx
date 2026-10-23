import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-input bg-background/60 h-10 w-full min-w-0 rounded-md border px-3 py-2 text-sm',
        'shadow-[0_1px_0_0] shadow-white/[0.03] transition-colors outline-none',
        'placeholder:text-muted-foreground/70',
        'focus-visible:border-primary/60 focus-visible:ring-ring/40 focus-visible:ring-[3px]',
        'aria-invalid:border-destructive/70 aria-invalid:ring-destructive/25 aria-invalid:ring-[3px]',
        'disabled:pointer-events-none disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
