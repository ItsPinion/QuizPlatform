import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-10 w-full min-w-0 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors outline-none',
        'placeholder:text-gray-500',
        'focus-visible:border-white/30 focus-visible:ring-2 focus-visible:ring-white/15',
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
